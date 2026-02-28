# Scratchy Widget SDK

Build interactive widgets that communicate with Scratchy agents.

## Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://your-scratchy-instance/sdk/widget.js"></script>
</head>
<body>
  <h1 id="greeting">Loading...</h1>
  <button id="ask">Ask Agent</button>

  <script>
    const widget = new ScratchyWidget({
      name: 'Hello Widget',
      description: 'A simple demo widget',
      permissions: ['toast'],

      onInit(config) {
        document.getElementById('greeting').textContent = 'Hello from Scratchy!';
      },

      onData(key, value) {
        console.log('Received data:', key, value);
      },

      onCommand(cmd, args) {
        console.log('Command:', cmd, args);
      },

      onTheme(theme) {
        document.body.style.background = theme.bg;
        document.body.style.color = theme.textPrimary;
      },
    });

    document.getElementById('ask').addEventListener('click', () => {
      widget.action('agent.send', { message: 'What time is it?' });
    });
  </script>
</body>
</html>
```

## Widget Manifest

Widgets declare their capabilities via the manifest (passed in constructor):

```js
{
  name: 'My Widget',
  description: 'What it does',
  icon: '🔧',
  author: 'Your Name',
  version: '1.0.0',
  permissions: ['canvas', 'toast', 'navigate', 'agent.send', 'storage', 'theme'],
}
```

## Permissions

| Permission | Description |
|------------|-------------|
| `canvas` | Push GenUI canvas ops to the host |
| `toast` | Show toast notifications (granted by default) |
| `navigate` | Open URLs in the host browser |
| `agent.send` | Send messages to the active agent |
| `storage` | Read/write persistent key-value storage |
| `theme` | Receive theme updates (granted by default) |

## API

### `widget.action(name, data)`
Trigger a host-side action. Common actions:
- `agent.send` — Send a message to the agent: `{ message: 'hello' }`

### `widget.toast(message, severity)`
Show a notification. Severity: `info`, `success`, `warning`, `error`.

### `widget.resize(width, height)`
Request the host to resize the widget iframe.

### `widget.navigate(url, target)`
Ask the host to open a URL. Target: `_blank`, `_self`, `surface`.

### `widget.canvasOps(ops)`
Push GenUI canvas operations. Requires `canvas` permission.

### `widget.request(method, params) → Promise`
Make a request to the host and wait for a response.

## Events from Host

| Callback | When |
|----------|------|
| `onInit(config)` | Host sends initialization data |
| `onData(key, value)` | Host pushes data to widget |
| `onCommand(cmd, args)` | Host sends a command |
| `onTheme(theme)` | Theme changed (dark/light, accent color) |

## Theme Object

```js
{
  bg: '#0a0a0f',
  accent: '#6366f1',
  textPrimary: 'rgba(255,255,255,0.9)',
  textSecondary: 'rgba(255,255,255,0.5)',
  borderColor: 'rgba(255,255,255,0.06)',
  radius: '8px',
  mode: 'dark',
}
```
