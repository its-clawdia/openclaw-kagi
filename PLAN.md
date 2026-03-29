# OpenClaw Kagi Web Search Plugin — Implementation Plan

## Overview

Build an OpenClaw plugin that registers Kagi as a `web_search` provider. When configured, the agent's `web_search` tool will route queries through Kagi's Search API instead of Brave/DuckDuckGo/etc.

**Plugin id:** `kagi`
**npm package:** `openclaw-kagi` (published to npm + ClawHub)
**Repository:** `github.com/its-clawdia/openclaw-kagi` (public)

---

## Kagi Search API Reference

- **Base URL:** `https://kagi.com/api/v0`
- **Auth:** `Authorization: Bot <KAGI_API_KEY>` header
- **Search endpoint:** `GET /search?q=<query>&limit=<n>`
- **Cost:** $0.025/query
- **Status:** v0 beta, invite-only (email support@kagi.com for access)
- **Key management:** https://kagi.com/settings/api
- **Credits:** https://kagi.com/settings/billing_api

### Search Response Shape
```json
{
  "meta": {
    "id": "uuid",
    "node": "us-central1",
    "ms": 213,
    "api_balance": 123.456
  },
  "data": [
    {
      "t": 0,        // 0 = search result, 1 = related searches
      "url": "https://...",
      "title": "...",
      "snippet": "...",
      "published": "2024-09-30T00:00:00Z",  // optional
      "thumbnail": { "url": "...", "width": 310, "height": 300 }  // optional
    }
  ],
  "error": null  // null on success, array of error objects on failure
}
```

### Error Codes
| Code | Meaning |
|------|---------|
| 0 | Internal error |
| 1 | Malformed request |
| 2 | Unauthorized |
| 100 | No billing information |
| 101 | Insufficient credit |

### Image URLs
Bare image paths like `/proxy/filename.jpg?c=HASH` must be prefixed with `https://kagi.com`.

---

## Architecture

### Plugin Type
This is a **web search provider plugin** — it registers via `api.registerWebSearchProvider()` following the same pattern as the bundled Brave, Exa, and Tavily plugins.

### Key Interface: `WebSearchProviderPlugin`
```typescript
{
  id: string;                    // "kagi"
  label: string;                 // "Kagi"
  hint: string;                  // "Privacy-first search"
  envVars: string[];             // ["KAGI_API_KEY"]
  placeholder: string;           // "Bot ..."
  signupUrl: string;             // "https://kagi.com/settings/api"
  credentialPath: string;        // JSON path for stored key
  autoDetectOrder?: number;      // e.g. 50 (between existing providers)
  
  // Credential getter/setter for plugin-scoped config
  getCredentialValue: (searchConfig?) => unknown;
  setCredentialValue: (target, value) => void;
  
  // The core method — returns the tool definition
  createTool: (ctx) => WebSearchProviderToolDefinition | null;
}
```

### Key Interface: `WebSearchProviderToolDefinition`
```typescript
{
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (args) => Promise<Record<string, unknown>>;
}
```

---

## File Structure

```
openclaw-kagi/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── LICENSE                         # MIT
├── .github/
│   └── workflows/
│       └── publish.yml             # npm publish on release
├── src/
│   ├── index.ts                    # definePluginEntry + registerWebSearchProvider
│   ├── kagi-search-provider.ts     # createKagiWebSearchProvider()
│   ├── kagi-api.ts                 # Raw Kagi API client (fetch wrapper)
│   └── kagi-search-provider.test.ts
```

---

## Implementation Steps

### Phase 1: Project Scaffolding

1. **Create GitHub repo** `its-clawdia/openclaw-kagi` (public)
2. **Initialize npm package** with TypeScript, ESM, vitest
3. **Create manifest** `openclaw.plugin.json`
4. **Create `package.json`** with `openclaw.extensions` metadata

### Phase 2: Core Implementation

#### `src/kagi-api.ts` — Kagi API Client
- `kagiSearch(apiKey, query, limit)` function
- Handles the `Authorization: Bot <key>` header
- Parses response, filters `t: 0` results (search results only, skip `t: 1` related searches)
- Maps to OpenClaw's standard result format: `{ title, url, snippet, published? }`
- Prefixes bare image proxy URLs with `https://kagi.com`
- Error handling for Kagi error codes (0, 1, 2, 100, 101)
- Respects configurable timeout

#### `src/kagi-search-provider.ts` — Provider Registration
- Exports `createKagiWebSearchProvider()` returning a `WebSearchProviderPlugin`
- Uses SDK helpers from `openclaw/plugin-sdk/provider-web-search`:
  - `getScopedCredentialValue` / `setScopedCredentialValue` for credential management
  - `resolveWebSearchProviderCredential` for runtime key resolution
  - `resolveSearchCount`, `resolveSearchTimeoutSeconds` for defaults
  - `readCachedSearchPayload` / `writeCachedSearchPayload` for result caching
  - `buildSearchCacheKey` for cache key generation
  - `jsonResult` for formatting tool output
- `createTool()` returns the tool definition that:
  1. Resolves the API key from config or `KAGI_API_KEY` env var
  2. Checks cache first
  3. Calls Kagi Search API
  4. Caches the response
  5. Returns structured results

#### `src/index.ts` — Plugin Entry Point
```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createKagiWebSearchProvider } from "./kagi-search-provider.js";

export default definePluginEntry({
  id: "kagi",
  name: "Kagi Search",
  description: "Kagi privacy-first web search provider for OpenClaw",
  register(api) {
    api.registerWebSearchProvider(createKagiWebSearchProvider());
  },
});
```

### Phase 3: Configuration

#### `openclaw.plugin.json`
```json
{
  "id": "kagi",
  "name": "Kagi Search",
  "description": "Kagi privacy-first web search provider",
  "version": "1.0.0",
  "contracts": {
    "webSearchProviders": ["kagi"]
  },
  "uiHints": {
    "apiKey": {
      "label": "Kagi API key",
      "placeholder": "Bot ...",
      "sensitive": true
    }
  },
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "webSearch": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "apiKey": { "type": "string" }
        }
      }
    }
  }
}
```

#### User Config (after installation)
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
          webSearch: {
            apiKey: "YOUR_KAGI_API_KEY",  // or set KAGI_API_KEY env var
          },
        },
      },
    },
  },
}
```

### Phase 4: Testing

1. **Unit tests** (vitest):
   - API client response parsing (mock fetch)
   - Error code handling (401, insufficient credit, etc.)
   - Result filtering (`t: 0` only)
   - Image URL prefixing
   - Cache key generation
   - Credential resolution
2. **Integration test** (manual):
   - Install plugin locally
   - Configure with real Kagi API key
   - Run `web_search` queries through the agent
   - Verify results match Kagi web UI

### Phase 5: Publishing

1. **npm OIDC trusted publishing** via GitHub Actions (same pattern as clawsage)
2. **ClawHub publishing** via `npx clawhub@latest publish`
3. **README** with install instructions, config examples, pricing note

---

## Supported `web_search` Parameters

| Parameter | Kagi Support | Notes |
|-----------|-------------|-------|
| `query` | ✅ | Maps to `q` param |
| `count` | ✅ | Maps to `limit` param (max 10 per OpenClaw) |
| `country` | ❌ | Kagi doesn't expose country filtering |
| `language` | ❌ | Kagi doesn't expose language filtering |
| `freshness` | ❌ | Not supported in Kagi Search API v0 |
| `date_after` | ❌ | Not supported |
| `date_before` | ❌ | Not supported |

For unsupported filter parameters, the plugin should return a note indicating the filter was ignored (using `buildUnsupportedSearchFilterResponse` helper if applicable), rather than silently dropping them.

---

## Pricing Note for README

> Kagi Search API costs $0.025 per query. Cached responses are free. You need a Kagi account with API credits. The Search API is currently invite-only — email support@kagi.com for access.

---

## Open Questions

1. **Search API access:** Kagi Search API is invite-only. Does Mom already have access, or need to request it?
2. **Auto-detect order:** Where should Kagi fall in the auto-detection precedence? Suggesting order 50 (after Brave at ~10, before DuckDuckGo at 100).
3. **Additional Kagi APIs:** The plugin could later add `kagi_summarize` and `kagi_fastgpt` as optional registered tools (like Tavily does with `tavily_extract`). Out of scope for v1 but worth noting.

---

## Dependencies

- `openclaw/plugin-sdk/plugin-entry` — entry point
- `openclaw/plugin-sdk/provider-web-search` — all web search helpers
- `@sinclair/typebox` — parameter schema (if needed; may use raw JSON Schema instead)
- No external Kagi SDK needed — simple REST GET with fetch
