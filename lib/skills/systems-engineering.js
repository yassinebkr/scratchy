/**
 * @skill systems-engineering
 * Low-level systems programming: PTY, process I/O, WebSocket, resource monitoring.
 * Agents: Sys
 */
export default {
  id: 'systems-engineering',
  name: 'Systems Engineering',
  description: 'PTY management, process I/O, WebSocket servers, resource monitoring',
  category: 'backend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Systems Engineering

### Domain: PTY Management
- Use \`node-pty\` for pseudo-terminal allocation
- Always handle: spawn, write (stdin), read (stdout+stderr), resize (cols/rows), kill
- Buffer partial reads — PTY output doesn't respect message boundaries
- Clean up on disconnect: kill process, remove listeners, free PTY
- Encoding: always UTF-8, handle incomplete multi-byte sequences at buffer boundaries
- Environment: inherit parent env, add TERM=xterm-256color, COLORTERM=truecolor

\`\`\`js
// PTY lifecycle pattern
import pty from 'node-pty';
const proc = pty.spawn(shell, args, { name: 'xterm-256color', cols: 80, rows: 24, cwd, env });
proc.onData(data => ws.send(JSON.stringify({ type: 'pty-output', data })));
proc.onExit(({ exitCode }) => ws.send(JSON.stringify({ type: 'pty-exit', code: exitCode })));
ws.on('message', msg => { const m = JSON.parse(msg); if (m.type === 'pty-input') proc.write(m.data); });
ws.on('close', () => proc.kill());
\`\`\`

### Domain: Process I/O
- Use \`child_process.spawn\` (never exec for long-running)
- Stream stdout/stderr separately — don't merge them
- Handle backpressure: pause readable if WS is slow, resume when drained
- Exit codes: 0 = success, non-zero = failure, null = killed by signal
- Timeout: always set a max execution time, kill on expiry

### Domain: WebSocket Servers
- Message format: \`{ type: string, ...payload }\` — always typed
- Heartbeat: ping every 30s, close on 2 missed pongs
- Reconnect-safe: client can reconnect and resume state
- Binary frames for PTY data (raw bytes), text frames for control messages
- Backpressure: check \`ws.bufferedAmount\` before sending, queue if > threshold

### Domain: Resource Monitoring
- CPU: \`os.cpus()\` — calculate % from idle vs total delta over interval
- Memory: \`os.freemem()\` / \`os.totalmem()\` — report used/total/percentage
- Disk: \`child_process.execSync('df -B1 /')\` — parse used/available
- Process-level: \`process.memoryUsage()\` — rss, heapUsed, heapTotal, external
- Push interval: 3-5 seconds via WS, not faster (client can't render faster)

### Safety Rules
- Never spawn processes with user-supplied paths without validation
- Never pass raw user input as shell arguments — use array form of spawn
- Always limit concurrent PTY sessions per user (max 3)
- Always set process kill timeout (30s default)
- Resource monitoring must not block the event loop — all async`,
};
