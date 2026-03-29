# openclaw-kagi

Kagi web search provider plugin for [OpenClaw](https://openclaw.ai). Uses Kagi Session Links to provide privacy-first search results through OpenClaw's `web_search` tool.

## How it works

This plugin scrapes Kagi's server-rendered HTML search results using your Kagi Session Link token. No API key required — uses your existing Kagi subscription at no additional cost.

**Dual-mode design:** When the Kagi Search API exits invite-only beta, the plugin can switch to the official API with a config change.

## Setup

### 1. Install

```bash
openclaw plugins install openclaw-kagi
```

### 2. Get your Session Link token

1. Go to https://kagi.com/settings/user_details
2. Find "Session Link" and copy the URL
3. The token is the value after `?token=`

### 3. Configure

Set the token via environment variable:

```bash
export KAGI_SESSION_TOKEN="your_token_here"
```

Or paste the full Session Link URL — the plugin extracts the token automatically:

```bash
export KAGI_SESSION_TOKEN="https://kagi.com/search?token=your_token_here"
```

Or in OpenClaw config:

```json5
{
  tools: {
    web: {
      search: {
        provider: "kagi",
      },
    },
  },
  plugins: {
    entries: {
      kagi: {
        config: {
          sessionToken: "your_token_here",
        },
      },
    },
  },
}
```

## Features

- **Privacy-first search** via your Kagi subscription
- **No API key needed** — uses Session Links (included in all Kagi plans)
- **Token expiry detection** — clear error messages when your token needs refreshing
- **HTML breakage detection** — reports when Kagi's HTML structure changes, with debug info
- **Result caching** — configurable TTL (default 15 minutes)
- **Accepts full URL or raw token** — paste either format

## Supported parameters

| Parameter | Support | Notes |
|-----------|---------|-------|
| `query` | ✅ | Search query |
| `count` | ✅ | Results to return (1-10) |
| `country` | ❌ | Not available via Session Links |
| `language` | ❌ | Not available via Session Links |
| `freshness` | ❌ | Not available via Session Links |

## Token management

Session Link tokens expire after 90 days of inactivity or when you log out of the session they were copied from. When the plugin detects an expired token, it returns a clear message with instructions to generate a new one.

## Development

```bash
npm install
npm run build
npm test

# Verify with real Kagi account
KAGI_SESSION_TOKEN="your_token" node scripts/verify.mjs "test query"
```

## License

MIT
