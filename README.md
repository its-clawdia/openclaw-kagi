# openclaw-kagi

Privacy-first web search powered by [Kagi](https://kagi.com) for [OpenClaw](https://openclaw.ai).

Uses your existing Kagi subscription — no API key or extra costs required.

## Install

```bash
openclaw plugins install openclaw-kagi
```

## Setup

### Option 1: `/kagi` command

```
/kagi session https://kagi.com/search?token=...
```

### Option 2: Automatic

Just use web search. If no Session Link is configured, the agent will ask you to paste one.

### Getting your Session Link

1. Go to https://kagi.com/settings/user_details
2. Copy your **Session Link**
3. Paste it when prompted, or use `/kagi session <session-link>`

## Commands

| Command | Description |
|---------|-------------|
| `/kagi session <session-link>` | Save your Kagi Session Link |
| `/kagi status` | Check if a Session Link is configured |
| `/kagi clear` | Remove saved Session Link |

## Configuration

Set Kagi as your search provider in OpenClaw config:

```json5
{
  tools: {
    web: {
      search: {
        provider: "kagi",
      },
    },
  },
}
```

The Session Link is stored separately in `~/.openclaw/kagi.config.json`.

## Supported parameters

| Parameter | Support |
|-----------|---------|
| `query` | ✅ |
| `count` | ✅ (1-10) |
| `country` | ❌ |
| `language` | ❌ |
| `freshness` | ❌ |

## Session Link management

Session Links expire after 90 days of inactivity or when you log out of the session they were created from. When the plugin detects an expired link, it will ask you for a new one.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
