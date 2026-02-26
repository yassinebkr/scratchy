# exec

Execute shell commands with background continuation support.
Use for running scripts, checking system state, installing packages, etc.

## Parameters

- command: Shell command to execute (required)
- workdir: Working directory (optional, defaults to cwd)
- timeout: Timeout in seconds (optional, kills process on expiry)
- background: Run in background immediately (boolean)
- pty: Run in a pseudo-terminal for TTY-required commands

## Notes

For long-running commands, use background mode and poll with the process tool.
Supports environment variable injection via the env parameter.
