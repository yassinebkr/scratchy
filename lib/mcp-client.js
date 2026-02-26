/**
 * @module lib/mcp-client
 * MCP Client — connects to MCP servers via stdio transport.
 * Implements JSON-RPC 2.0 for tool discovery and invocation.
 *
 * Usage:
 *   const client = new McpClient({ command: 'npx @anthropic/mcp-figma', env: { FIGMA_TOKEN: '...' } });
 *   await client.connect();
 *   const tools = await client.listTools();
 *   const result = await client.callTool('figma_get_file', { fileKey: 'abc123' });
 *   await client.disconnect();
 */

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RECONNECT_BASE_DELAY = 500; // ms

/**
 * @typedef {Object} McpClientOpts
 * @property {string}  command  — Shell command to spawn (e.g. 'npx @anthropic/mcp-figma')
 * @property {string[]} [args]  — Additional arguments
 * @property {Record<string,string>} [env] — Extra environment variables
 * @property {number}  [timeout=30000] — Default timeout in ms for requests
 * @property {boolean} [reconnect=false] — Whether to auto-reconnect on process exit
 * @property {number}  [maxRetries=3] — Max reconnect attempts
 * @property {number}  [reconnectBaseDelay=500] — Base delay for exponential backoff (ms)
 */

export class McpClient {
  /** @param {McpClientOpts} opts */
  constructor(opts) {
    this._command = opts.command;
    this._args = opts.args || [];
    this._env = opts.env || {};
    this._timeout = opts.timeout ?? DEFAULT_TIMEOUT;
    this._reconnectEnabled = opts.reconnect ?? false;
    this._maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this._reconnectBaseDelay = opts.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY;
    this._process = null;
    this._nextId = 1;
    /** @type {Map<number, {resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout>}>} */
    this._pending = new Map();
    this._buffer = '';
    this._connected = false;
    this._tools = null; // cached tools after listTools
    this._reconnecting = false;
    this._reconnectAttempts = 0;
    this._intentionalDisconnect = false;
    /** @type {number|null} */
    this._pid = null;

    // Event callbacks
    /** @type {((err: Error) => void)|null} */
    this.onError = null;
    /** @type {((code: number|null, signal: string|null) => void)|null} */
    this.onExit = null;
    /** @type {(() => void)|null} */
    this.onReconnect = null;
    /** @type {(() => void)|null} */
    this.onReconnectFailed = null;
  }

  /** Whether the client is connected to an MCP server process */
  get connected() { return this._connected; }

  /** PID of the child process (null if not running) */
  get pid() { return this._pid; }

  /**
   * Spawn the MCP server child process and complete the initialize handshake.
   * @returns {Promise<Object>} Server capabilities from the initialize response
   */
  async connect() {
    if (this._connected) throw new Error('Already connected');
    this._intentionalDisconnect = false;

    return this._doConnect();
  }

  /**
   * Internal connect logic — also used by reconnect.
   * @returns {Promise<Object>}
   */
  _doConnect() {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._cleanup();
        reject(new Error('MCP connect timeout'));
      }, this._timeout);

      try {
        this._process = spawn(this._command, this._args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this._env },
          shell: true,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn MCP server: ${err.message}`));
        return;
      }

      // Track PID
      this._pid = this._process.pid ?? null;

      // Suppress EPIPE on stdin (process may have exited before we write)
      if (this._process.stdin) {
        this._process.stdin.on('error', () => { /* swallow EPIPE */ });
      }

      // Handle process errors
      this._process.on('error', (err) => {
        clearTimeout(timeoutId);
        this._pid = null;
        this._rejectAllPending(new Error(`MCP process error: ${err.message}`));
        this._connected = false;
        if (this.onError) this.onError(err);
        reject(new Error(`MCP process error: ${err.message}`));
      });

      this._process.on('exit', (code, signal) => {
        this._pid = null;
        this._rejectAllPending(new Error(`MCP process exited (code=${code}, signal=${signal})`));
        const wasConnected = this._connected;
        this._connected = false;

        if (this.onExit) this.onExit(code, signal);

        // Auto-reconnect if enabled and this wasn't intentional
        if (wasConnected && this._reconnectEnabled && !this._intentionalDisconnect && !this._reconnecting) {
          this._attemptReconnect();
        }
      });

      // Collect stderr for logging
      if (this._process.stderr) {
        this._process.stderr.on('data', (chunk) => {
          const text = chunk.toString('utf-8').trim();
          if (text) console.warn(`[mcp:${this._command}:stderr]`, text);
        });
      }

      // Read stdout — newline-delimited JSON-RPC responses
      this._process.stdout.on('data', (chunk) => {
        this._buffer += chunk.toString('utf-8');
        this._processBuffer();
      });

      // Send initialize request
      const initId = this._nextId++;
      this._pending.set(initId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          this._connected = true;
          this._reconnectAttempts = 0; // Reset on successful connect
          // Send initialized notification (no id — it's a notification)
          this._writeMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        timer: timeoutId,
      });

      this._writeMessage({
        jsonrpc: '2.0',
        id: initId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'scratchy', version: '2.0.0' },
        },
      });
    });
  }

  /**
   * Attempt reconnection with exponential backoff.
   * @private
   */
  async _attemptReconnect() {
    if (this._reconnecting) return;
    this._reconnecting = true;

    while (this._reconnectAttempts < this._maxRetries && !this._intentionalDisconnect) {
      this._reconnectAttempts++;
      const delay = this._reconnectBaseDelay * Math.pow(2, this._reconnectAttempts - 1);

      await new Promise(r => setTimeout(r, delay));

      if (this._intentionalDisconnect) break;

      try {
        this._cleanup(); // Clean up old process remains
        await this._doConnect();
        this._reconnecting = false;
        if (this.onReconnect) this.onReconnect();
        return; // Success
      } catch {
        // Will retry
      }
    }

    this._reconnecting = false;
    if (this.onReconnectFailed) this.onReconnectFailed();
  }

  /**
   * List tools available on the connected MCP server.
   * @returns {Promise<Array<{name: string, description: string, inputSchema: Object}>>}
   */
  async listTools() {
    if (!this._connected) throw new Error('Not connected');
    const result = await this._request('tools/list', {});
    this._tools = result.tools || [];
    return this._tools;
  }

  /**
   * Call a tool on the connected MCP server.
   * @param {string} name — Tool name
   * @param {Object} args — Tool arguments
   * @returns {Promise<Object>} Tool result
   */
  async callTool(name, args = {}) {
    if (!this._connected) throw new Error('Not connected');
    const result = await this._request('tools/call', { name, arguments: args });
    return result;
  }

  /**
   * Disconnect from the MCP server — kill child process, clean up.
   */
  async disconnect() {
    this._intentionalDisconnect = true;
    this._connected = false;
    this._rejectAllPending(new Error('Disconnected'));
    this._cleanup();
  }

  /* ── Internal methods ────────────────────────────────────── */

  /**
   * Send a JSON-RPC request and return a promise for the result.
   * @param {string} method
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, this._timeout);

      this._pending.set(id, { resolve, reject, timer });

      this._writeMessage({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  /**
   * Write a JSON-RPC message to the child process stdin.
   * @param {Object} msg
   */
  _writeMessage(msg) {
    if (!this._process || !this._process.stdin || this._process.stdin.destroyed) {
      return;
    }
    try {
      this._process.stdin.write(JSON.stringify(msg) + '\n');
    } catch {
      // stdin may be closed
    }
  }

  /**
   * Process the stdout buffer — extract complete JSON lines.
   */
  _processBuffer() {
    const lines = this._buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this._buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        // Not valid JSON — skip (could be debug output)
        continue;
      }

      // Handle JSON-RPC response (has id)
      if (msg.id != null && this._pending.has(msg.id)) {
        const { resolve, reject, timer } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        clearTimeout(timer);

        if (msg.error) {
          reject(new Error(msg.error.message || `MCP error: ${JSON.stringify(msg.error)}`));
        } else {
          resolve(msg.result);
        }
      }
      // Notifications (no id) are ignored for now
    }
  }

  /**
   * Reject all pending requests.
   * @param {Error} err
   */
  _rejectAllPending(err) {
    for (const [id, { reject, timer }] of this._pending) {
      clearTimeout(timer);
      reject(err);
    }
    this._pending.clear();
  }

  /**
   * Kill child process and clean up resources.
   */
  _cleanup() {
    this._buffer = '';
    this._tools = null;
    if (this._process) {
      try {
        this._process.stdin?.destroy();
        this._process.stdout?.destroy();
        this._process.stderr?.destroy();
        this._process.kill('SIGTERM');
        // Force kill after 3 seconds
        const proc = this._process;
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        }, 3000).unref();
      } catch {
        // Process may already be dead
      }
      this._process = null;
      this._pid = null;
    }
  }
}
