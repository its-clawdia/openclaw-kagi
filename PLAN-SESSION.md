# OpenClaw Kagi Plugin — Session Link (HTML Scraping) Plan

## Overview

Build an OpenClaw plugin that registers Kagi as a `web_search` provider using **Kagi Session Links** instead of the official API. Session Links are token-based URLs that provide full Kagi search access without API billing. The plugin scrapes HTML search results and parses them into the standard OpenClaw result format.

**Plugin id:** `kagi`
**npm package:** `openclaw-kagi`
**Data source:** Kagi Session Links (`https://kagi.com/search?token=TOKEN&q=QUERY`)

---

## Why Session Links Instead of the API

- Kagi Search API is invite-only (v0 beta), costs $0.025/query, and requires separate API credits
- Session Links are available to any Kagi subscriber at no additional cost
- Session Links use the user's existing Kagi plan/quota
- The plugin is structured so switching to the official API later is a config change, not a rewrite

---

## How Kagi Session Links Work

1. User goes to https://kagi.com/settings/user_details
2. Under "Session Link", they copy a URL like: `https://kagi.com/search?token=ABC123DEF456`
3. The `token` query parameter is what we store — it authenticates requests as that user
4. Search URL format: `https://kagi.com/html/search?token=TOKEN&q=QUERY`
5. Tokens can expire or be revoked — the user regenerates them from the same settings page

**Critical discovery:** The main `/search` endpoint renders results via **JavaScript** (the HTML shell contains a `<noscript>` redirect). The `/html/search` endpoint returns **server-rendered HTML** with all results inline — this is the endpoint we must use.

**Token input flexibility:** The plugin must accept either:
- The full Session Link URL: `https://kagi.com/search?token=ABC123DEF456`
- Just the token value: `ABC123DEF456`

The plugin extracts the token from either format at configuration time.

**Invalid token behavior:** Kagi returns HTTP 302 redirect to `https://kagi.com/signin?p=invalid_token` with an empty body. No HTML is served.

**Important:** Session tokens are tied to the user's Kagi subscription. The plugin must treat them as sensitive credentials.

---

## Architecture

### Dual-Mode Design

```
src/
├── index.ts                          # Plugin entry, registers provider
├── kagi-search-provider.ts           # Provider shell (credential mgmt, tool def)
├── search/
│   ├── types.ts                      # Shared types (KagiSearchResult, etc.)
│   ├── session-search.ts             # Session Link mode: fetch + parse HTML
│   ├── api-search.ts                 # API mode: stub (not yet implemented)
│   └── selectors.json                # CSS selectors for HTML parsing
├── html-parser.ts                    # HTML → structured results parser
├── token-validator.ts                # Detect expired/invalid tokens
```

The provider dispatches to the appropriate search function based on `mode` config:

```typescript
// In kagi-search-provider.ts createTool().execute():
if (mode === "session") {
  return sessionSearch(token, query, count);
} else if (mode === "api") {
  return apiSearch(apiKey, query, count);  // stub
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
├── LICENSE                              # MIT
├── .github/
│   └── workflows/
│       └── publish.yml                  # npm publish on release
├── src/
│   ├── index.ts                         # definePluginEntry + registerWebSearchProvider
│   ├── kagi-search-provider.ts          # createKagiWebSearchProvider()
│   ├── search/
│   │   ├── types.ts                     # KagiSearchResult, ParsedSearchPage, etc.
│   │   ├── session-search.ts            # Session Link fetch + parse pipeline
│   │   ├── api-search.ts               # API mode stub
│   │   └── selectors.json              # CSS selectors config
│   ├── html-parser.ts                   # DOM parsing logic (uses selectors.json)
│   └── token-validator.ts              # Token/auth state detection
└── test/
    ├── html-parser.test.ts              # Parser unit tests
    ├── token-validator.test.ts          # Token validation tests
    ├── session-search.test.ts           # Integration tests (mocked fetch)
    ├── kagi-search-provider.test.ts     # Provider registration tests
    └── fixtures/
        ├── kagi-results-normal.html     # Real Kagi result page (sanitized)
        ├── kagi-results-no-results.html # "No results found" page
        ├── kagi-results-mutated.html    # Broken HTML (selectors changed)
        ├── kagi-login-redirect.html     # Expired token → login page
        └── kagi-results-single.html     # Page with exactly one result
```

---

## Type Definitions

### `src/search/types.ts`

```typescript
/** A single parsed search result */
export interface KagiSearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;       // ISO date string if available
  siteName?: string;        // Extracted domain
}

/** Output of the HTML parser */
export interface ParsedSearchPage {
  results: KagiSearchResult[];
  /** Total result count shown by Kagi, if parseable */
  totalResults?: number;
  /** Raw HTML size in bytes — used for breakage detection */
  rawHtmlBytes: number;
  /** Whether the page appeared to contain results we couldn't parse */
  possibleBreakage: boolean;
  /** If possibleBreakage is true, a sample of the HTML structure for debugging */
  htmlStructureSample?: string;
}

/** Token validation state */
export type TokenStatus =
  | { valid: true }
  | { valid: false; reason: "redirect_to_login" | "login_form_detected" | "http_error"; statusCode?: number; detail?: string };

/** Search mode */
export type KagiSearchMode = "session" | "api";

/** Plugin-specific config shape (inside plugins.entries.kagi.config) */
export interface KagiPluginConfig {
  /** Search mode: 'session' (HTML scraping) or 'api' (official API, not yet implemented) */
  mode?: KagiSearchMode;
  /** Session Link token (for mode: 'session') */
  sessionToken?: string;
  /** API key (for mode: 'api', future use) */
  webSearch?: {
    apiKey?: string;
  };
}

/** Selector definition for a single search result */
export interface ResultSelectors {
  /** CSS selector for each result container */
  resultContainer: string;
  /** CSS selector for the title element (relative to container) */
  title: string;
  /** CSS selector for the URL element (relative to container) */
  url: string;
  /** Attribute on the URL element that holds the href */
  urlAttribute: string;
  /** CSS selector for the snippet element (relative to container) */
  snippet: string;
  /** CSS selector for the published date (relative to container), optional */
  published?: string;
}

/** Shape of selectors.json */
export interface SelectorsConfig {
  /** Version number — bump when selectors change */
  version: number;
  /** Last verified date (ISO) */
  lastVerified: string;
  /** Selectors for organic search results */
  organicResults: ResultSelectors;
  /** CSS selector that indicates a "no results" page */
  noResultsIndicator: string;
  /** CSS selector or string that indicates a login/auth page */
  loginIndicators: string[];
  /** Minimum expected HTML size (bytes) for a page with results — below this suggests breakage or empty response */
  minExpectedPageBytes: number;
}
```

---

## CSS Selectors Configuration (Verified 2026-03-29)

These selectors were verified against real Kagi `/html/search` responses.

### HTML Structure of a Search Result

```html
<!-- Primary result (with description) -->
<div class="_0_SRI  search-result " data-highlight="">
  <div class="_0_TITLE __sri-title">
    <h3 class="__sri-title-box">
      <a class="__sri_title_link _ext_ub_t _0_sri_title_link _0_URL"
         data-domain="openai.com"
         title="GPT-5 is here - OpenAI"
         href="https://openai.com/gpt-5/">
        GPT-5 is here - OpenAI
      </a>
    </h3>
    <!-- ... menu buttons ... -->
  </div>
  <div class="__sri-url-box">
    <a class="_0_URL __sri-url" href="https://openai.com/gpt-5/" data-domain="openai.com">
      <span class="host">openai.com</span>&nbsp;<span class="path"> › gpt-5</span>
    </a>
  </div>
  <div class="__sri-body">
    <div class="_0_DESC __sri-desc">
      <span class="__sri-time ">  Dec 19, 2025  </span>  <!-- optional -->
      <div> GPT‑5 is smarter... </div>
    </div>
  </div>
</div>

<!-- Grouped sub-result (under a primary result, same domain) -->
<div class="sr-group">
  <div class="__srgi" data-highlight="">
    <div class="__sri-title">
      <h3 class="__srgi-title">
        <a class="_0_URL" href="https://openai.com/index/introducing-gpt-5/">
          Introducing GPT-5
        </a>
      </h3>
    </div>
  </div>
</div>
```

### `src/search/selectors.json`

```json
{
  "version": 1,
  "lastVerified": "2026-03-29",
  "searchUrl": "https://kagi.com/html/search",
  "organicResults": {
    "resultContainer": "div._0_SRI.search-result",
    "title": "a.__sri_title_link",
    "url": "a.__sri_title_link",
    "urlAttribute": "href",
    "snippet": "div.__sri-desc",
    "published": "span.__sri-time"
  },
  "groupedResults": {
    "resultContainer": "div.__srgi",
    "title": "a._0_URL",
    "url": "a._0_URL",
    "urlAttribute": "href"
  },
  "noResultsIndicator": ".search-no-results, .no-results",
  "loginIndicators": [
    "signin?p=invalid_token"
  ],
  "minExpectedPageBytes": 5000,
  "notes": {
    "endpoint": "/html/search is the server-rendered endpoint; /search requires JS",
    "invalidToken": "Returns HTTP 302 to /signin?p=invalid_token with empty body",
    "groupedResults": "Some results have sub-results in a .sr-group div, class __srgi"
  }
}
```

**Key findings from real HTML analysis:**
- **Endpoint:** Must use `/html/search` (not `/search`) — the main endpoint requires JavaScript
- **Primary results:** `div._0_SRI.search-result` containers with `a.__sri_title_link` for title/URL
- **Grouped results:** Sub-results under `div.__srgi` with `a._0_URL` links (same domain, different pages)
- **Snippets:** `div.__sri-desc` contains the description text, optionally preceded by `span.__sri-time`
- **Date:** `span.__sri-time` contains human-readable dates like "Dec 19, 2025"
- **Invalid token:** HTTP 302 redirect to `/signin?p=invalid_token`, empty body (no HTML to parse)
- **Page size:** Normal results page is ~150KB; even obscure queries return results

---

## Implementation Details

### 1. Token Validator (`src/token-validator.ts`)

```typescript
import type { TokenStatus } from "./search/types.js";

/**
 * Validates a Kagi session token by checking the HTTP response.
 * Does NOT parse results — just checks if the token grants access.
 *
 * Real behavior (verified 2026-03-29):
 * - Invalid/expired token: HTTP 302 redirect to /signin?p=invalid_token, empty body
 * - Valid token: HTTP 200 with HTML search results (~150KB)
 *
 * IMPORTANT: fetch() must be called with `redirect: "manual"` so we can
 * detect the 302 ourselves. If redirect: "follow" is used, we'd follow
 * the redirect to the signin page and get a 200 with login HTML.
 */
export function validateTokenFromResponse(
  response: Response,
): TokenStatus {
  // Check 1: HTTP 302 redirect (the primary invalid-token signal)
  if (response.status === 302) {
    const location = response.headers.get("location") ?? "";
    if (location.includes("signin") || location.includes("invalid_token")) {
      return { valid: false, reason: "redirect_to_login" };
    }
    // Unknown redirect — still treat as invalid
    return {
      valid: false,
      reason: "redirect_to_login",
      detail: `Redirected to: ${location}`,
    };
  }

  // Check 2: Any non-200 status
  if (!response.ok) {
    return {
      valid: false,
      reason: "http_error",
      statusCode: response.status,
      detail: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  // Check 3: 200 response — token is valid
  return { valid: true };
}

/**
 * Extract token from either a full Session Link URL or a raw token string.
 * Accepts:
 * - "https://kagi.com/search?token=ABC123" → "ABC123"
 * - "ABC123" → "ABC123"
 */
export function extractToken(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // Not a URL — treat as raw token
  }
  return trimmed;
}
```

### 2. HTML Parser (`src/html-parser.ts`)

The parser uses `linkedom` (lightweight DOM implementation for Node.js) to parse HTML and extract results using CSS selectors.

```typescript
import { parseHTML } from "linkedom";
import type { KagiSearchResult, ParsedSearchPage, SelectorsConfig } from "./search/types.js";
import selectorsConfig from "./search/selectors.json" assert { type: "json" };

export function parseKagiResultsPage(
  html: string,
  selectors: SelectorsConfig = selectorsConfig
): ParsedSearchPage {
  const rawHtmlBytes = Buffer.byteLength(html, "utf-8");
  const { document } = parseHTML(html);

  // Check for "no results" page
  const noResults = document.querySelector(selectors.noResultsIndicator);
  if (noResults) {
    return { results: [], rawHtmlBytes, possibleBreakage: false };
  }

  // Parse result containers
  const containers = document.querySelectorAll(
    selectors.organicResults.resultContainer
  );
  const results: KagiSearchResult[] = [];

  for (const container of containers) {
    const titleEl = container.querySelector(selectors.organicResults.title);
    const urlEl = container.querySelector(selectors.organicResults.url);
    const snippetEl = container.querySelector(selectors.organicResults.snippet);
    const publishedEl = selectors.organicResults.published
      ? container.querySelector(selectors.organicResults.published)
      : null;

    const title = titleEl?.textContent?.trim() ?? "";
    const url = urlEl?.getAttribute(selectors.organicResults.urlAttribute) ?? "";
    const snippet = snippetEl?.textContent?.trim() ?? "";
    const published = publishedEl?.getAttribute("datetime")
      ?? publishedEl?.textContent?.trim()
      ?? undefined;

    // Skip entries with no title AND no URL (garbage nodes)
    if (!title && !url) continue;

    results.push({
      title,
      url: normalizeUrl(url),
      snippet,
      published,
      siteName: extractDomain(url),
    });
  }

  // Breakage detection: page has substantial content but we parsed zero results
  const possibleBreakage =
    results.length === 0 && rawHtmlBytes > selectors.minExpectedPageBytes;

  return {
    results,
    rawHtmlBytes,
    possibleBreakage,
    htmlStructureSample: possibleBreakage
      ? extractStructureSample(document)
      : undefined,
  };
}

/** Normalize relative Kagi URLs to absolute */
function normalizeUrl(url: string): string {
  if (url.startsWith("/")) return `https://kagi.com${url}`;
  return url;
}

/** Extract domain from URL for siteName */
function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Extract a simplified view of the HTML structure for debugging.
 * Returns the first ~2000 chars of the body with content stripped,
 * showing only tag structure.
 */
function extractStructureSample(document: Document): string {
  const body = document.querySelector("body");
  if (!body) return "<no body element found>";

  // Get outer HTML, strip text content, collapse whitespace
  const html = body.innerHTML
    .replace(/>([^<]+)</g, "> <")  // strip text between tags
    .replace(/\s+/g, " ")          // collapse whitespace
    .slice(0, 2000);               // limit length

  return html;
}
```

**Dependency:** `linkedom` — a fast, spec-compliant DOM parser for Node.js. Much lighter than `jsdom`. No native dependencies.

### 3. Session Search (`src/search/session-search.ts`)

```typescript
import type { KagiSearchResult } from "./types.js";
import { parseKagiResultsPage } from "../html-parser.js";
import { validateTokenFromResponse } from "../token-validator.js";

const KAGI_SEARCH_URL = "https://kagi.com/html/search";

export interface SessionSearchOptions {
  token: string;
  query: string;
  count: number;
  timeoutMs: number;
}

export interface SessionSearchResult {
  ok: true;
  results: KagiSearchResult[];
} | {
  ok: false;
  error: string;
  errorCode: "token_expired" | "token_invalid" | "parse_breakage" | "fetch_error";
  detail?: string;
  htmlSample?: string;
}

export async function sessionSearch(
  opts: SessionSearchOptions
): Promise<SessionSearchResult> {
  const url = new URL(KAGI_SEARCH_URL);
  url.searchParams.set("token", opts.token);
  url.searchParams.set("q", opts.query);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "OpenClaw-Kagi/1.0 (Plugin; +https://github.com/its-clawdia/openclaw-kagi)",
        "Accept": "text/html",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Failed to fetch Kagi search results: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "fetch_error",
    };
  }

  // Validate token (must check before reading body — 302 has empty body)
  const tokenStatus = validateTokenFromResponse(response);
  if (!tokenStatus.valid) {
    const messages: Record<string, string> = {
      redirect_to_login:
        "Your Kagi session token has expired or is invalid. Please generate a new Session Link at https://kagi.com/settings/user_details and update your config.",
      http_error:
        `Kagi returned HTTP ${tokenStatus.statusCode}. Your session token may be invalid. Check https://kagi.com/settings/user_details`,
    };
    return {
      ok: false,
      error: messages[tokenStatus.reason] ?? "Unknown token error",
      errorCode: tokenStatus.reason === "http_error" ? "token_invalid" : "token_expired",
      detail: tokenStatus.detail,
    };
  }

  const html = await response.text();

  // Parse HTML
  const parsed = parseKagiResultsPage(html);

  // Breakage detection
  if (parsed.possibleBreakage) {
    return {
      ok: false,
      error: [
        "Kagi returned a page but no search results could be parsed.",
        "This likely means Kagi's HTML structure has changed and the plugin's selectors need updating.",
        "",
        "To help debug, here is a sample of the page structure:",
        "```",
        parsed.htmlStructureSample ?? "(no sample available)",
        "```",
        "",
        "Please report this issue at https://github.com/its-clawdia/openclaw-kagi/issues",
        "or update the selectors in the plugin's selectors.json file.",
      ].join("\n"),
      errorCode: "parse_breakage",
      htmlSample: parsed.htmlStructureSample,
    };
  }

  // Trim to requested count
  const results = parsed.results.slice(0, opts.count);

  return { ok: true, results };
}
```

### 4. API Search Stub (`src/search/api-search.ts`)

```typescript
export async function apiSearch(
  _apiKey: string,
  _query: string,
  _count: number
): Promise<never> {
  throw new Error(
    "Kagi API mode is not yet implemented. Use mode: 'session' (the default) " +
    "to search via Session Links. API mode will be available in a future version " +
    "when the Kagi Search API exits invite-only beta."
  );
}
```

### 5. Search Provider (`src/kagi-search-provider.ts`)

```typescript
import {
  getScopedCredentialValue,
  setScopedCredentialValue,
  resolveProviderWebSearchPluginConfig,
  setProviderWebSearchPluginConfigValue,
  buildSearchCacheKey,
  readCachedSearchPayload,
  writeCachedSearchPayload,
  resolveSearchCount,
  resolveSearchTimeoutSeconds,
  resolveSearchCacheTtlMs,
  resolveSiteName,
  wrapWebContent,
  readStringParam,
  readNumberParam,
  enablePluginInConfig,
} from "openclaw/plugin-sdk/provider-web-search";
import { readProviderEnvValue } from "openclaw/plugin-sdk/provider-web-search";
import { sessionSearch } from "./search/session-search.js";
import { apiSearch } from "./search/api-search.js";
import type { KagiSearchMode, KagiPluginConfig } from "./search/types.js";

const PROVIDER_ID = "kagi";

/** Resolve session token from config or environment */
function resolveSessionToken(pluginConfig?: KagiPluginConfig): string | undefined {
  // 1. Plugin config: plugins.entries.kagi.config.sessionToken
  if (pluginConfig?.sessionToken) return pluginConfig.sessionToken;
  // 2. Environment variable
  return readProviderEnvValue(["KAGI_SESSION_TOKEN"]) ?? undefined;
}

/** Resolve search mode from config, defaulting to 'session' */
function resolveMode(pluginConfig?: KagiPluginConfig): KagiSearchMode {
  if (pluginConfig?.mode === "api") return "api";
  return "session";
}

export function createKagiWebSearchProvider() {
  return {
    id: PROVIDER_ID,
    label: "Kagi Search",
    hint: "Privacy-first search via Session Links",

    // Credential fields — these are used by the SDK for onboarding/config UI.
    // For session mode, the "credential" is the session token.
    // For API mode (future), it would be the API key.
    credentialLabel: "Kagi Session Token",
    envVars: ["KAGI_SESSION_TOKEN"],
    placeholder: "paste token from Session Link URL",
    signupUrl: "https://kagi.com/settings/user_details",
    docsUrl: "https://github.com/its-clawdia/openclaw-kagi#readme",
    autoDetectOrder: 50,
    credentialPath: "plugins.entries.kagi.config.sessionToken",
    inactiveSecretPaths: [
      "plugins.entries.kagi.config.sessionToken",
      "plugins.entries.kagi.config.webSearch.apiKey",
    ],

    getCredentialValue: (searchConfig: any) =>
      getScopedCredentialValue(searchConfig, PROVIDER_ID),
    setCredentialValue: (target: any, value: any) =>
      setScopedCredentialValue(target, PROVIDER_ID, value),
    getConfiguredCredentialValue: (config: any) =>
      resolveProviderWebSearchPluginConfig(config, PROVIDER_ID)?.sessionToken
      ?? resolveProviderWebSearchPluginConfig(config, PROVIDER_ID)?.apiKey,
    setConfiguredCredentialValue: (target: any, value: any) => {
      setProviderWebSearchPluginConfigValue(target, PROVIDER_ID, "sessionToken", value);
    },
    applySelectionConfig: (config: any) => enablePluginInConfig(config, PROVIDER_ID).config,

    createTool: (ctx: any) => {
      const pluginConfig: KagiPluginConfig | undefined =
        resolveProviderWebSearchPluginConfig(ctx.config, PROVIDER_ID);
      const mode = resolveMode(pluginConfig);

      return {
        description:
          "Search the web using Kagi, a privacy-first search engine. " +
          "Returns structured results with titles, URLs, and snippets.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
            count: {
              type: "number",
              description: "Number of results to return (1-10, default 5)",
              minimum: 1,
              maximum: 10,
            },
          },
          required: ["query"],
          additionalProperties: false,
        },

        execute: async (args: Record<string, unknown>) => {
          const query = readStringParam(args, "query", { required: true });
          if (!query) {
            return { error: "missing_query", message: "A search query is required." };
          }

          const count = resolveSearchCount(
            readNumberParam(args, "count", { integer: true }),
            5
          );
          const timeoutMs = (resolveSearchTimeoutSeconds(ctx.searchConfig) ?? 30) * 1000;
          const cacheTtlMs = resolveSearchCacheTtlMs(ctx.searchConfig, 15);

          // ── API mode (stub) ──
          if (mode === "api") {
            const apiKey = pluginConfig?.webSearch?.apiKey
              ?? readProviderEnvValue(["KAGI_API_KEY"])
              ?? undefined;
            if (!apiKey) {
              return {
                error: "missing_kagi_api_key",
                message:
                  "Kagi API key not configured. Set KAGI_API_KEY env var or " +
                  "configure plugins.entries.kagi.config.webSearch.apiKey. " +
                  "Note: API mode is not yet implemented — consider using mode: 'session' instead.",
              };
            }
            // This will throw with "not yet implemented"
            return await apiSearch(apiKey, query, count);
          }

          // ── Session mode ──
          const token = resolveSessionToken(pluginConfig);
          if (!token) {
            return {
              error: "missing_session_token",
              message: [
                "Kagi session token not configured.",
                "",
                "To set up Kagi search:",
                "1. Go to https://kagi.com/settings/user_details",
                "2. Find 'Session Link' and copy the URL",
                "3. Extract the token from the URL (the value after ?token=)",
                "4. Set it in your config:",
                "   - Environment variable: KAGI_SESSION_TOKEN=<token>",
                "   - Or in openclaw config: plugins.entries.kagi.config.sessionToken",
              ].join("\n"),
            };
          }

          // Check cache
          const cacheKey = buildSearchCacheKey([PROVIDER_ID, "session", query, String(count)]);
          const cached = readCachedSearchPayload(cacheKey);
          if (cached) return cached;

          // Execute search
          const start = Date.now();
          const result = await sessionSearch({
            token,
            query,
            count,
            timeoutMs,
          });

          if (!result.ok) {
            return {
              error: result.errorCode,
              message: result.error,
              ...(result.detail ? { detail: result.detail } : {}),
            };
          }

          // Format response in standard OpenClaw shape
          const payload = {
            query,
            provider: PROVIDER_ID,
            count: result.results.length,
            tookMs: Date.now() - start,
            externalContent: {
              untrusted: true,
              source: "web_search",
              provider: PROVIDER_ID,
              wrapped: true,
            },
            results: result.results.map((r) => ({
              title: wrapWebContent(r.title, "web_search"),
              url: r.url,
              description: wrapWebContent(r.snippet, "web_search"),
              published: r.published,
              siteName: r.siteName ?? resolveSiteName(r.url),
            })),
          };

          // Cache the response
          writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);

          return payload;
        },
      };
    },
  };
}
```

### 6. Plugin Entry Point (`src/index.ts`)

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createKagiWebSearchProvider } from "./kagi-search-provider.js";

export default definePluginEntry({
  id: "kagi",
  name: "Kagi Search",
  description: "Kagi privacy-first web search for OpenClaw via Session Links",
  register(api) {
    api.registerWebSearchProvider(createKagiWebSearchProvider());
  },
});
```

---

## Plugin Manifest

### `openclaw.plugin.json`

```json
{
  "id": "kagi",
  "name": "Kagi Search",
  "description": "Privacy-first web search powered by Kagi Session Links",
  "version": "1.0.0",
  "contracts": {
    "webSearchProviders": ["kagi"]
  },
  "uiHints": {
    "sessionToken": {
      "label": "Kagi Session Token",
      "placeholder": "paste token from your Session Link URL",
      "sensitive": true,
      "helpUrl": "https://kagi.com/settings/user_details"
    },
    "mode": {
      "label": "Search mode",
      "description": "'session' uses Session Links (default), 'api' uses official API (not yet available)"
    }
  },
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["session", "api"],
        "default": "session",
        "description": "Search mode: 'session' (Session Link HTML scraping) or 'api' (official API, not yet implemented)"
      },
      "sessionToken": {
        "type": "string",
        "description": "Kagi Session Link token (from https://kagi.com/settings/user_details)"
      },
      "webSearch": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "apiKey": {
            "type": "string",
            "description": "Kagi API key (for future API mode)"
          }
        }
      }
    }
  }
}
```

---

## User Configuration Examples

### Minimal config (session token via env var)

```bash
export KAGI_SESSION_TOKEN="your_token_here"
```

```json5
// openclaw config
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

### Full config (token in config file)

```json5
{
  tools: {
    web: {
      search: {
        provider: "kagi",
        maxResults: 5,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
      },
    },
  },
  plugins: {
    entries: {
      kagi: {
        config: {
          mode: "session",
          sessionToken: "YOUR_SESSION_TOKEN_HERE",
        },
      },
    },
  },
}
```

### Future API mode config (not yet functional)

```json5
{
  tools: {
    web: { search: { provider: "kagi" } },
  },
  plugins: {
    entries: {
      kagi: {
        config: {
          mode: "api",
          webSearch: {
            apiKey: "YOUR_KAGI_API_KEY",
          },
        },
      },
    },
  },
}
```

---

## Error Messages

### Missing Session Token (first use, no config)

```
Kagi session token not configured.

To set up Kagi search:
1. Go to https://kagi.com/settings/user_details
2. Find 'Session Link' and copy the URL
3. Extract the token from the URL (the value after ?token=)
4. Set it in your config:
   - Environment variable: KAGI_SESSION_TOKEN=<token>
   - Or in openclaw config: plugins.entries.kagi.config.sessionToken
```

### Expired Token (redirect to login)

```
Your Kagi session token has expired. Please generate a new Session Link at https://kagi.com/settings/user_details and update your config.
```

### Invalid Token (login form in response)

```
Your Kagi session token appears to be invalid. The response contained a login page instead of search results. Please check your token at https://kagi.com/settings/user_details
```

### HTML Parsing Breakage

```
Kagi returned a page but no search results could be parsed.
This likely means Kagi's HTML structure has changed and the plugin's selectors need updating.

To help debug, here is a sample of the page structure:
```
<div class="new-result-wrapper"> <div class="..."> </div> </div>
```

Please report this issue at https://github.com/its-clawdia/openclaw-kagi/issues
or update the selectors in the plugin's selectors.json file.
```

### API Mode Not Implemented

```
Kagi API mode is not yet implemented. Use mode: 'session' (the default) to search via Session Links. API mode will be available in a future version when the Kagi Search API exits invite-only beta.
```

### Fetch Error (network)

```
Failed to fetch Kagi search results: <error message>
```

---

## Dependencies

### Runtime

| Package | Purpose | Why this one |
|---------|---------|-------------|
| `linkedom` | HTML → DOM parsing | Fast, lightweight, no native deps (unlike jsdom). Supports querySelectorAll with CSS selectors. |

### Dev / Peer

| Package | Purpose |
|---------|---------|
| `openclaw` (peer) | Plugin SDK types and helpers |
| `typescript` | Build |
| `vitest` | Tests |
| `@sinclair/typebox` | Optional — for parameter schemas if preferred over raw JSON Schema |

### NOT needed

- No Kagi SDK — we're doing raw HTTP + HTML parsing
- No `cheerio` — `linkedom` is sufficient and lighter
- No `puppeteer`/`playwright` — Kagi serves full HTML without JS rendering

---

## Testing Strategy

### Test Fixtures

Create fixtures by:
1. Making real Kagi session searches in a browser
2. Saving the HTML response (View Source or curl)
3. Sanitizing: remove the session token from any URLs in the HTML, replace any personal info

Required fixtures in `test/fixtures/`:

| File | Description |
|------|-------------|
| `kagi-results-normal.html` | A typical search with 5-10 organic results |
| `kagi-results-single.html` | A search with exactly 1 result |
| `kagi-results-no-results.html` | Kagi's "no results found" page |
| `kagi-results-mutated.html` | Normal page with CSS classes renamed (simulates breakage) |
| `kagi-login-redirect.html` | The login page HTML (simulates expired token) |

### Unit Tests

#### `test/html-parser.test.ts`

```typescript
describe("parseKagiResultsPage", () => {
  it("parses normal search results", async () => {
    const html = await readFixture("kagi-results-normal.html");
    const result = parseKagiResultsPage(html);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.possibleBreakage).toBe(false);
    for (const r of result.results) {
      expect(r.title).toBeTruthy();
      expect(r.url).toMatch(/^https?:\/\//);
      expect(r.snippet).toBeTruthy();
    }
  });

  it("returns empty results for no-results page", async () => {
    const html = await readFixture("kagi-results-no-results.html");
    const result = parseKagiResultsPage(html);
    expect(result.results).toHaveLength(0);
    expect(result.possibleBreakage).toBe(false);
  });

  it("detects breakage when selectors don't match a content-rich page", async () => {
    const html = await readFixture("kagi-results-mutated.html");
    const result = parseKagiResultsPage(html);
    expect(result.results).toHaveLength(0);
    expect(result.possibleBreakage).toBe(true);
    expect(result.htmlStructureSample).toBeTruthy();
  });

  it("handles single-result page", async () => {
    const html = await readFixture("kagi-results-single.html");
    const result = parseKagiResultsPage(html);
    expect(result.results).toHaveLength(1);
  });

  it("normalizes relative URLs", async () => {
    // Test with html containing /proxy/... URLs
    const html = '<div class="search-result"><h3><a href="/redirect?url=https%3A%2F%2Fexample.com">Title</a></h3><div class="sri-description">Snippet</div></div>';
    const result = parseKagiResultsPage(html);
    // URLs starting with / should be prefixed with https://kagi.com
    for (const r of result.results) {
      expect(r.url).toMatch(/^https?:\/\//);
    }
  });
});
```

#### `test/token-validator.test.ts`

```typescript
describe("validateTokenFromResponse", () => {
  it("returns valid for normal 200 response", () => {
    const response = new Response("...", { status: 200 });
    const status = validateTokenFromResponse(response, "<html>...</html>");
    expect(status.valid).toBe(true);
  });

  it("detects redirect to login", () => {
    // Simulate a redirected response
    const response = createRedirectedResponse("https://kagi.com/login");
    const status = validateTokenFromResponse(response, "");
    expect(status).toEqual({ valid: false, reason: "redirect_to_login" });
  });

  it("detects login form in HTML", () => {
    const html = await readFixture("kagi-login-redirect.html");
    const response = new Response(html, { status: 200 });
    const status = validateTokenFromResponse(response, html);
    expect(status.valid).toBe(false);
    expect(status.reason).toBe("login_form_detected");
  });

  it("reports HTTP errors", () => {
    const response = new Response("", { status: 403 });
    const status = validateTokenFromResponse(response, "");
    expect(status).toEqual({
      valid: false,
      reason: "http_error",
      statusCode: 403,
      detail: "HTTP 403 Forbidden",
    });
  });
});
```

#### `test/session-search.test.ts`

```typescript
describe("sessionSearch", () => {
  it("returns parsed results for valid token", async () => {
    // Mock fetch to return normal fixture
    const html = await readFixture("kagi-results-normal.html");
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(html, { status: 200 }));

    const result = await sessionSearch({
      token: "test-token",
      query: "test query",
      count: 5,
      timeoutMs: 10000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.length).toBeLessThanOrEqual(5);
    }
  });

  it("returns error for expired token", async () => {
    // Mock fetch to simulate redirect to login
    const response = createRedirectedResponse("https://kagi.com/login");
    vi.spyOn(global, "fetch").mockResolvedValue(response);

    const result = await sessionSearch({
      token: "expired-token",
      query: "test",
      count: 5,
      timeoutMs: 10000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("token_expired");
      expect(result.error).toContain("expired");
    }
  });

  it("returns breakage error when parser fails on content-rich page", async () => {
    const html = await readFixture("kagi-results-mutated.html");
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(html, { status: 200 }));

    const result = await sessionSearch({
      token: "valid-token",
      query: "test",
      count: 5,
      timeoutMs: 10000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("parse_breakage");
      expect(result.htmlSample).toBeTruthy();
    }
  });

  it("handles fetch timeout", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("The operation was aborted"));

    const result = await sessionSearch({
      token: "valid-token",
      query: "test",
      count: 5,
      timeoutMs: 100,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("fetch_error");
    }
  });
});
```

---

## Implementation Phases

### Phase 0: Research — DONE ✅
HTML structure verified against real Kagi `/html/search` responses on 2026-03-29.

Key findings:
- Must use `/html/search` endpoint (not `/search` which requires JS)
- Primary results: `div._0_SRI.search-result` with `a.__sri_title_link`
- Grouped sub-results: `div.__srgi` with `a._0_URL`
- Snippets: `div.__sri-desc`, dates in `span.__sri-time`
- Invalid token: HTTP 302 → `/signin?p=invalid_token`, empty body
- Normal page: ~150KB HTML

Test fixtures saved in `test-fixtures/`:
- `kagi-results-normal.html` — real search for "openai gpt 5" (14 primary + 4 grouped results)
- `kagi-results-sparse.html` — obscure query with minimal results
- `kagi-badtoken-behavior.txt` — documents the 302 redirect behavior

### Phase 1: Project Scaffolding
**Goal:** Working project that builds and runs tests.

1. Initialize the npm package: `package.json` with ESM config, TypeScript, vitest
2. Create `tsconfig.json` (ESM, strict, node16 module resolution)
3. Create `vitest.config.ts`
4. Create `openclaw.plugin.json` manifest
5. Create `src/search/types.ts` with all type definitions
6. Create `src/search/selectors.json` (from Phase 0)
7. Copy test fixtures into `test/fixtures/`
8. Verify `npm run build` and `npm test` work (even with placeholder tests)

**Deliverable:** Buildable project with types, config, and fixtures.

### Phase 2: HTML Parser
**Goal:** Reliable HTML → structured results parsing with breakage detection.

1. Install `linkedom`
2. Implement `src/html-parser.ts`:
   - `parseKagiResultsPage(html, selectors?)`
   - URL normalization
   - Domain extraction
   - Structure sample extraction for breakage reports
3. Write `test/html-parser.test.ts`:
   - Normal results parsing
   - No-results page
   - Breakage detection (mutated HTML)
   - Single result
   - URL normalization

**Deliverable:** Parser that passes all fixture-based tests.

### Phase 3: Token Validator
**Goal:** Detect invalid/expired session tokens.

1. Implement `src/token-validator.ts`:
   - Redirect detection
   - Login form detection
   - HTTP error detection
2. Write `test/token-validator.test.ts`

**Deliverable:** Token validator with tests.

### Phase 4: Session Search
**Goal:** End-to-end search via Session Links.

1. Implement `src/search/session-search.ts`:
   - Fetch with timeout
   - Token validation
   - HTML parsing
   - Breakage error formatting
   - Result count trimming
2. Implement `src/search/api-search.ts` (stub)
3. Write `test/session-search.test.ts` with mocked fetch

**Deliverable:** Working session search with all error paths tested.

### Phase 5: Provider Integration
**Goal:** Register as an OpenClaw web_search provider.

1. Implement `src/kagi-search-provider.ts`:
   - Credential resolution (token from config or env)
   - Mode resolution (session vs api)
   - Cache integration (buildSearchCacheKey, read/writeCachedSearchPayload)
   - Standard OpenClaw result format (externalContent, wrapWebContent, etc.)
   - Error payloads for missing token, expired token, breakage
2. Implement `src/index.ts` (plugin entry)
3. Write `test/kagi-search-provider.test.ts`:
   - Provider metadata correctness
   - createTool returns valid definition
   - Missing token returns setup instructions
   - Mode switching

**Deliverable:** Complete, testable plugin.

### Phase 6: Manual Testing & Polish
**Goal:** Verify end-to-end with real Kagi account.

1. Build the plugin: `npm run build`
2. Install locally in OpenClaw
3. Configure with a real session token
4. Test searches and verify results
5. Test with expired token, verify error message
6. Test cache behavior
7. Write README with setup instructions
8. Add LICENSE (MIT)

**Deliverable:** Working plugin ready for publishing.

### Phase 7: Publishing
**Goal:** Available on npm and ClawHub.

1. Set up GitHub Actions for npm publishing (OIDC trusted publishing)
2. `npm publish` (or via CI on tag/release)
3. `npx clawhub@latest publish`
4. Verify installation: `openclaw plugin add kagi`

---

## `package.json`

```json
{
  "name": "openclaw-kagi",
  "version": "1.0.0",
  "description": "Kagi privacy-first web search provider for OpenClaw",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "openclaw.plugin.json"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["openclaw", "openclaw-plugin", "kagi", "web-search"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/its-clawdia/openclaw-kagi"
  },
  "peerDependencies": {
    "openclaw": ">=0.1.0"
  },
  "dependencies": {
    "linkedom": "^0.16.0"
  },
  "devDependencies": {
    "openclaw": "*",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "openclaw": {
    "extensions": {
      "webSearchProviders": ["kagi"]
    }
  }
}
```

---

## Supported `web_search` Parameters

| Parameter | Session Mode Support | Notes |
|-----------|---------------------|-------|
| `query` | ✅ | Maps to `q` URL param |
| `count` | ✅ | Trim parsed results to N (Kagi returns ~10 by default) |
| `country` | ❌ | Not controllable via Session Links |
| `language` | ❌ | Not controllable via Session Links |
| `freshness` | ❌ | Not controllable via Session Links |
| `date_after` | ❌ | Not controllable via Session Links |
| `date_before` | ❌ | Not controllable via Session Links |

---

## Open Questions

1. **Kagi rate limiting on session links:** Does Kagi throttle or block rapid searches via session links? Need to test. If so, we may need a rate limiter or backoff.
2. **Kagi HTML stability:** How often does Kagi change their HTML structure? This determines how much maintenance the selectors will need.
3. **Session token lifetime:** How long do session tokens last before expiring? This affects how often users need to refresh.
4. **Kagi ToS:** Confirm that scraping via Session Links is acceptable under Kagi's terms of service. Session Links are an official feature intended for sharing search access.
5. **Search filters via URL params:** Does Kagi's search URL accept additional parameters (e.g., `&t=1h` for time filtering)? If so, we could support more `web_search` parameters than listed above.
