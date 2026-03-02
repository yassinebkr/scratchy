/**
 * @fileoverview NullClaw Webhook Adapter — per-user agent instance manager.
 *
 * Manages a pool of NullClaw processes, one per active user. Each instance
 * gets a unique port from a configurable range, health monitoring, idle
 * timeout, and automatic crash recovery.
 *
 * @module lib/nullclaw-adapter
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default port range for NullClaw instances. */
const DEFAULT_PORT_MIN = 29_000;
const DEFAULT_PORT_MAX = 29_999;

/** Idle timeout before auto-shutdown (ms). */
const IDLE_TIMEOUT_MS = 30 * 60 * 1_000; // 30 minutes

/** Health check interval (ms). */
const HEALTH_CHECK_INTERVAL_MS = 15_000; // 15 seconds

/** Max consecutive health check failures before restart. */
const MAX_HEALTH_FAILURES = 3;

/** Startup grace period — skip health checks for this long after spawn (ms). */
const STARTUP_GRACE_MS = 5_000;

/** Max restart attempts before marking instance as errored. */
const MAX_RESTARTS = 5;

/** Restart cooldown window — reset restart counter after this (ms). */
const RESTART_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes

// ─── Instance state ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} InstanceState
 * @property {string}              userId        — owning user ID
 * @property {number}              port          — assigned port
 * @property {import('child_process').ChildProcess|null} process — child process handle
 * @property {number|null}         pid           — OS process ID
 * @property {'starting'|'running'|'stopped'|'error'} status
 * @property {number}              startedAt     — epoch ms
 * @property {number}              lastActivity  — epoch ms (reset on webhook)
 * @property {number}              restartCount  — restarts within window
 * @property {number}              firstRestartAt — epoch ms of first restart in window
 * @property {number}              healthFailures — consecutive health check misses
 * @property {NodeJS.Timeout|null} idleTimer     — idle shutdown timer
 */

// ─── NullClawAdapter ────────────────────────────────────────────────────────

/**
 * Manages per-user NullClaw process instances with port pooling,
 * health monitoring, idle timeouts, and crash recovery.
 *
 * @extends EventEmitter
 *
 * @fires NullClawAdapter#spawn     — { userId, port, pid }
 * @fires NullClawAdapter#destroy   — { userId, port }
 * @fires NullClawAdapter#restart   — { userId, port, attempt }
 * @fires NullClawAdapter#error     — { userId, error }
 * @fires NullClawAdapter#health    — { userId, status }
 */
export class NullClawAdapter extends EventEmitter {
  /** @type {Map<string, InstanceState>} userId → instance */
  #instances = new Map();

  /** @type {Set<number>} ports currently in use */
  #usedPorts = new Set();

  /** @type {number} */
  #portMin;

  /** @type {number} */
  #portMax;

  /** @type {string} command/binary to spawn */
  #command;

  /** @type {string[]} extra args passed to every instance */
  #baseArgs;

  /** @type {Record<string, string>} extra env vars for child processes */
  #env;

  /** @type {NodeJS.Timeout|null} health check interval handle */
  #healthInterval = null;

  /**
   * @param {Object} [opts]
   * @param {number}   [opts.portMin=29000]    — lowest port in pool
   * @param {number}   [opts.portMax=29999]    — highest port in pool
   * @param {string}   [opts.command='nullclaw'] — binary/command to spawn
   * @param {string[]} [opts.baseArgs=[]]      — extra CLI args
   * @param {Record<string, string>} [opts.env={}] — extra env vars
   */
  constructor(opts = {}) {
    super();
    this.#portMin = opts.portMin ?? DEFAULT_PORT_MIN;
    this.#portMax = opts.portMax ?? DEFAULT_PORT_MAX;
    this.#command = opts.command ?? 'nullclaw';
    this.#baseArgs = opts.baseArgs ?? [];
    this.#env = opts.env ?? {};

    // Start periodic health checks
    this.#healthInterval = setInterval(() => this.#runHealthChecks(), HEALTH_CHECK_INTERVAL_MS);
    this.#healthInterval.unref(); // don't block process exit
  }

  // ── Port pool ──────────────────────────────────────────────────────────────

  /**
   * Allocate the next available port from the pool.
   * @returns {number}
   * @throws {Error} If the port pool is exhausted.
   */
  #allocatePort() {
    for (let port = this.#portMin; port <= this.#portMax; port++) {
      if (!this.#usedPorts.has(port)) {
        this.#usedPorts.add(port);
        return port;
      }
    }
    throw new Error(
      `Port pool exhausted (${this.#portMin}-${this.#portMax}). ` +
      `${this.#usedPorts.size} instances active.`
    );
  }

  /**
   * Release a port back to the pool.
   * @param {number} port
   */
  #releasePort(port) {
    this.#usedPorts.delete(port);
  }

  // ── Instance lifecycle ─────────────────────────────────────────────────────

  /**
   * Spawn a new NullClaw instance for a user.
   * If the user already has an instance, returns the existing one.
   *
   * @param {string} userId
   * @returns {Promise<InstanceState>}
   */
  async spawnInstance(userId) {
    // Return existing instance if running
    const existing = this.#instances.get(userId);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      this.#resetIdleTimer(userId);
      return existing;
    }

    const port = this.#allocatePort();
    const now = Date.now();

    /** @type {InstanceState} */
    const instance = {
      userId,
      port,
      process: null,
      pid: null,
      status: 'starting',
      startedAt: now,
      lastActivity: now,
      restartCount: 0,
      firstRestartAt: 0,
      healthFailures: 0,
      idleTimer: null,
    };

    this.#instances.set(userId, instance);

    try {
      await this.#startProcess(instance);
    } catch (err) {
      this.#releasePort(port);
      this.#instances.delete(userId);
      this.emit('error', { userId, error: err });
      throw err;
    }

    this.#resetIdleTimer(userId);
    this.emit('spawn', { userId, port, pid: instance.pid });

    return instance;
  }

  /**
   * Start (or restart) the child process for an instance.
   * @param {InstanceState} instance
   */
  async #startProcess(instance) {
    const args = [
      ...this.#baseArgs,
      '--port', String(instance.port),
      '--user', instance.userId,
    ];

    const child = spawn(this.#command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...this.#env, PORT: String(instance.port) },
      detached: false,
    });

    instance.process = child;
    instance.pid = child.pid ?? null;

    // Capture stdout/stderr for debugging
    child.stdout?.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) this.emit('log', { userId: instance.userId, stream: 'stdout', line });
    });

    child.stderr?.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) this.emit('log', { userId: instance.userId, stream: 'stderr', line });
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      const wasRunning = instance.status === 'running' || instance.status === 'starting';
      instance.process = null;
      instance.pid = null;

      if (wasRunning) {
        // Unexpected exit — attempt restart
        this.#handleCrash(instance, code, signal);
      } else {
        instance.status = 'stopped';
      }
    });

    child.on('error', (err) => {
      instance.status = 'error';
      instance.process = null;
      instance.pid = null;
      this.emit('error', { userId: instance.userId, error: err });
    });

    // Wait briefly for process to start (or fail immediately)
    await new Promise((resolve, reject) => {
      const onExit = (code) => {
        cleanup();
        reject(new Error(`NullClaw exited immediately with code ${code}`));
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        cleanup();
        instance.status = 'running';
        resolve();
      }, 500);

      /** Remove one-shot listeners. */
      function cleanup() {
        clearTimeout(timer);
        child.removeListener('exit', onExit);
        child.removeListener('error', onError);
      }

      child.once('exit', onExit);
      child.once('error', onError);
    });
  }

  /**
   * Destroy a user's NullClaw instance, freeing its port.
   *
   * @param {string} userId
   * @returns {boolean} true if an instance was destroyed
   */
  destroyInstance(userId) {
    const instance = this.#instances.get(userId);
    if (!instance) return false;

    // Clear idle timer
    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer);
      instance.idleTimer = null;
    }

    // Mark as stopped so exit handler doesn't trigger restart
    instance.status = 'stopped';

    // Kill the process
    if (instance.process) {
      try {
        instance.process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }

      // Force kill after 5 seconds if still alive
      const forceKill = setTimeout(() => {
        try {
          instance.process?.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 5_000);
      forceKill.unref();
    }

    this.#releasePort(instance.port);
    this.#instances.delete(userId);
    this.emit('destroy', { userId, port: instance.port });

    return true;
  }

  /**
   * Handle an unexpected process crash — decide whether to restart.
   * @param {InstanceState} instance
   * @param {number|null} code
   * @param {string|null} signal
   */
  #handleCrash(instance, code, signal) {
    const now = Date.now();

    // Reset restart counter if outside the cooldown window
    if (now - instance.firstRestartAt > RESTART_WINDOW_MS) {
      instance.restartCount = 0;
      instance.firstRestartAt = now;
    }

    instance.restartCount++;

    if (instance.restartCount > MAX_RESTARTS) {
      instance.status = 'error';
      this.emit('error', {
        userId: instance.userId,
        error: new Error(
          `NullClaw crashed ${instance.restartCount} times in ${RESTART_WINDOW_MS / 1000}s ` +
          `(last exit: code=${code}, signal=${signal}). Giving up.`
        ),
      });
      return;
    }

    this.emit('restart', {
      userId: instance.userId,
      port: instance.port,
      attempt: instance.restartCount,
    });

    // Restart after a brief back-off (1s × attempt number)
    const backoff = 1_000 * instance.restartCount;
    setTimeout(async () => {
      try {
        instance.status = 'starting';
        instance.healthFailures = 0;
        await this.#startProcess(instance);
      } catch (err) {
        instance.status = 'error';
        this.emit('error', { userId: instance.userId, error: err });
      }
    }, backoff).unref();
  }

  // ── Idle timeout ───────────────────────────────────────────────────────────

  /**
   * Reset the idle timer for a user's instance.
   * @param {string} userId
   */
  #resetIdleTimer(userId) {
    const instance = this.#instances.get(userId);
    if (!instance) return;

    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer);
    }

    instance.lastActivity = Date.now();
    instance.idleTimer = setTimeout(() => {
      this.emit('log', {
        userId,
        stream: 'system',
        line: `Idle timeout (${IDLE_TIMEOUT_MS / 60_000}min) — shutting down`,
      });
      this.destroyInstance(userId);
    }, IDLE_TIMEOUT_MS);

    instance.idleTimer.unref();
  }

  // ── Health monitoring ──────────────────────────────────────────────────────

  /**
   * Run health checks on all active instances.
   */
  async #runHealthChecks() {
    for (const [userId, instance] of this.#instances) {
      if (instance.status !== 'running') continue;

      // Skip if still within startup grace period
      if (Date.now() - instance.startedAt < STARTUP_GRACE_MS) continue;

      // Skip health checks for instances with recent activity —
      // NullClaw's single-threaded Zig server can't respond to /health
      // while processing a long-running AI request (SSE streaming).
      const ACTIVE_GRACE_MS = 180_000; // 3 minutes
      if (instance.lastActivity && (Date.now() - instance.lastActivity) < ACTIVE_GRACE_MS) continue;

      try {
        const ok = await this.#pingHealth(instance.port);
        if (ok) {
          instance.healthFailures = 0;
          this.emit('health', { userId, status: 'ok' });
        } else {
          instance.healthFailures++;
          this.emit('health', { userId, status: 'degraded', failures: instance.healthFailures });
        }
      } catch {
        instance.healthFailures++;
      }

      // Too many failures — kill and let the crash handler restart
      if (instance.healthFailures >= MAX_HEALTH_FAILURES) {
        this.emit('log', {
          userId,
          stream: 'system',
          line: `Health check failed ${instance.healthFailures} times — killing process`,
        });
        try {
          instance.process?.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Ping the /health endpoint of a NullClaw instance.
   * @param {number} port
   * @returns {Promise<boolean>}
   */
  async #pingHealth(port) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);

      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Webhook routing ────────────────────────────────────────────────────────

  /**
   * Route an incoming webhook payload to a user's NullClaw instance.
   * Auto-spawns an instance if one isn't running.
   *
   * @param {string} userId
   * @param {Record<string, unknown>} payload — webhook body
   * @returns {Promise<{ status: number, body: unknown }>}
   */
  async routeWebhook(userId, payload) {
    // Auto-start on first message
    let instance = this.#instances.get(userId);
    if (!instance || instance.status === 'stopped' || instance.status === 'error') {
      instance = await this.spawnInstance(userId);
    }

    // Wait for instance to be ready
    if (instance.status === 'starting') {
      await this.#waitForReady(instance, 10_000);
    }

    this.#resetIdleTimer(userId);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(`http://127.0.0.1:${instance.port}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let body;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }

      return { status: res.status, body };
    } catch (err) {
      return { status: 502, body: { error: `Failed to reach NullClaw: ${err.message}` } };
    }
  }

  // ── /api/message — sync request-response ──────────────────────────────────

  /**
   * Send a message to a user's NullClaw instance via /api/message (sync).
   * Unlike routeWebhook, this blocks until the AI responds and returns
   * the actual response text in the body.
   *
   * @param {string} userId
   * @param {string} message — the message text
   * @param {string} [sessionKey] — optional session key (defaults to "api:<userId>")
   * @returns {Promise<{ status: number, body: unknown }>}
   */
  async routeMessage(userId, message, sessionKey) {
    let instance = this.#instances.get(userId);
    if (!instance || instance.status === 'stopped' || instance.status === 'error') {
      instance = await this.spawnInstance(userId);
    }
    if (instance.status === 'starting') {
      await this.#waitForReady(instance, 10_000);
    }
    this.#resetIdleTimer(userId);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min for AI response

      const res = await fetch(`http://127.0.0.1:${instance.port}/api/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          session_key: sessionKey ?? `api:${userId}`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let body;
      try { body = await res.json(); } catch { body = await res.text(); }
      return { status: res.status, body };
    } catch (err) {
      return { status: 502, body: { error: `Failed to reach NullClaw: ${err.message}` } };
    }
  }

  // ── /api/message SSE — streaming request-response ─────────────────────────

  /**
   * Send a message to a user's NullClaw instance via /api/message with SSE streaming.
   * Calls onChunk(delta) for each incremental text chunk. Returns the full
   * accumulated response when the stream ends.
   *
   * Named SSE events from NullClaw's ToolEventCallback are forwarded:
   *   event: tool_call_start  → onToolEvent({ type: 'tool_call_start', ... })
   *   event: tool_call_result → onToolEvent({ type: 'tool_call_result', ... })
   *   event: iteration_start  → onToolEvent({ type: 'iteration_start', ... })
   *
   * @param {string} userId
   * @param {string} message — the message text
   * @param {(chunk: string) => void} onChunk — called for each text delta
   * @param {string} [sessionKey] — optional session key
   * @param {((event: {type: string, [key: string]: any}) => void)|null} [onToolEvent] — called for tool events
   * @returns {Promise<string>} — full accumulated response text
   */
  async routeMessageStreaming(userId, message, onChunk, sessionKey, onToolEvent) {
    let instance = this.#instances.get(userId);
    if (!instance || instance.status === 'stopped' || instance.status === 'error') {
      instance = await this.spawnInstance(userId);
    }
    if (instance.status === 'starting') {
      await this.#waitForReady(instance, 10_000);
    }
    this.#resetIdleTimer(userId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min for streaming

    try {
      const res = await fetch(`http://127.0.0.1:${instance.port}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          message,
          session_key: sessionKey ?? `api:${userId}`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        let errBody;
        try { errBody = await res.json(); } catch { errBody = await res.text(); }
        const errMsg = typeof errBody === 'object' ? (errBody.error || JSON.stringify(errBody)) : String(errBody);
        throw new Error(`NullClaw /api/message returned ${res.status}: ${errMsg}`);
      }

      // Parse SSE stream
      let fullText = '';
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (terminated by \n\n)
        let eventEnd;
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          // Parse SSE event
          let eventType = 'message';
          let data = '';
          for (const line of event.split('\n')) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              data = line.slice(6);
            } else if (line.startsWith('data:')) {
              data = line.slice(5);
            }
          }

          if (!data) continue;

          // Handle [DONE] marker
          if (data === '[DONE]') break;

          // Handle error events
          if (eventType === 'error') {
            let errObj;
            try { errObj = JSON.parse(data); } catch { errObj = { error: data }; }
            throw new Error(errObj.error || 'Unknown streaming error');
          }

          // Handle tool event SSE types (from NullClaw's ToolEventCallback)
          if (eventType === 'tool_call_start' || eventType === 'tool_call_result' || eventType === 'iteration_start') {
            if (onToolEvent) {
              try {
                const parsed = JSON.parse(data);
                onToolEvent({ type: eventType, ...parsed });
              } catch {
                // Malformed event data — skip
              }
            }
            continue;
          }

          // Parse text delta (default 'message' event type)
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              fullText += parsed.delta;
              onChunk(parsed.delta);
            }
          } catch {
            // Non-JSON data line — treat as raw text
            fullText += data;
            onChunk(data);
          }
        }
      }

      return fullText;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Wait for an instance to transition from 'starting' to 'running'.
   * @param {InstanceState} instance
   * @param {number} timeoutMs
   */
  async #waitForReady(instance, timeoutMs) {
    const start = Date.now();
    while (instance.status === 'starting' && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (instance.status !== 'running') {
      throw new Error(`Instance for ${instance.userId} did not become ready (status: ${instance.status})`);
    }
  }

  // ── Status queries ─────────────────────────────────────────────────────────

  /**
   * Get the status of a user's NullClaw instance.
   *
   * @param {string} userId
   * @returns {{ status: string, port?: number, pid?: number, uptime?: number, lastActivity?: number } | null}
   */
  getInstanceStatus(userId) {
    const instance = this.#instances.get(userId);
    if (!instance) return null;

    const now = Date.now();
    return {
      status: instance.status,
      port: instance.port,
      pid: instance.pid ?? undefined,
      uptime: instance.status === 'running' ? Math.floor((now - instance.startedAt) / 1000) : 0,
      lastActivity: instance.lastActivity,
      restartCount: instance.restartCount,
      healthFailures: instance.healthFailures,
    };
  }

  /**
   * List all active NullClaw instances with stats.
   *
   * @returns {Array<{ userId: string, status: string, port: number, pid?: number, uptime: number }>}
   */
  listInstances() {
    const now = Date.now();
    const list = [];

    for (const [userId, instance] of this.#instances) {
      list.push({
        userId,
        status: instance.status,
        port: instance.port,
        pid: instance.pid ?? undefined,
        uptime: instance.status === 'running' ? Math.floor((now - instance.startedAt) / 1000) : 0,
        lastActivity: instance.lastActivity,
      });
    }

    return list;
  }

  /**
   * Get the total number of active instances.
   * @returns {number}
   */
  get size() {
    return this.#instances.size;
  }

  /**
   * Get the number of available ports remaining.
   * @returns {number}
   */
  get availablePorts() {
    return (this.#portMax - this.#portMin + 1) - this.#usedPorts.size;
  }

  // ── Shutdown ───────────────────────────────────────────────────────────────

  /**
   * Gracefully shut down all instances and stop health monitoring.
   * @returns {Promise<void>}
   */
  async shutdownAll() {
    if (this.#healthInterval) {
      clearInterval(this.#healthInterval);
      this.#healthInterval = null;
    }

    const userIds = [...this.#instances.keys()];
    for (const userId of userIds) {
      this.destroyInstance(userId);
    }

    // Give processes a moment to exit
    await new Promise((r) => setTimeout(r, 1_000));
  }
}
