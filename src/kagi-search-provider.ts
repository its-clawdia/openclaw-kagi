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
  readProviderEnvValue,
} from "openclaw/plugin-sdk/provider-web-search";
import { sessionSearch } from "./search/session-search.js";
import { apiSearch } from "./search/api-search.js";
import { extractToken } from "./token-validator.js";
import { readStoredToken } from "./token-store.js";
import type { KagiSearchMode, KagiPluginConfig } from "./search/types.js";

const PROVIDER_ID = "kagi";

/**
 * Resolve session token from multiple sources (priority order):
 * 1. Plugin token store (~/.openclaw/kagi-token.json) — set via chat
 * 2. Environment variable KAGI_SESSION_TOKEN
 * 3. Plugin config (plugins.entries.kagi.config.sessionToken)
 */
function resolveSessionToken(
  pluginConfig?: KagiPluginConfig
): string | undefined {
  // 1. Plugin's own store (highest priority — most recently set by user)
  const stored = readStoredToken();
  if (stored) return stored;

  // 2. Environment variable
  const envVal = readProviderEnvValue(["KAGI_SESSION_TOKEN"]) ?? undefined;
  if (envVal) return extractToken(envVal);

  // 3. Plugin config in openclaw.json
  if (pluginConfig?.sessionToken) {
    return extractToken(pluginConfig.sessionToken);
  }

  return undefined;
}

function resolveMode(pluginConfig?: KagiPluginConfig): KagiSearchMode {
  if (pluginConfig?.mode === "api") return "api";
  return "session";
}

export function createKagiWebSearchProvider() {
  return {
    id: PROVIDER_ID,
    label: "Kagi Search",
    hint: "Privacy-first search via Session Links",

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
    getConfiguredCredentialValue: (config: any) => {
      const wsCfg = resolveProviderWebSearchPluginConfig(config, PROVIDER_ID);
      return wsCfg?.sessionToken ?? wsCfg?.apiKey;
    },
    setConfiguredCredentialValue: (target: any, value: any) => {
      setProviderWebSearchPluginConfigValue(
        target,
        PROVIDER_ID,
        "sessionToken",
        value
      );
    },
    applySelectionConfig: (config: any) =>
      enablePluginInConfig(config, PROVIDER_ID).config,

    createTool: (ctx: any) => {
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
          // Resolve config fresh on every call so token updates
          // (via chat, env var, or config edit) take effect immediately
          const pluginConfig: KagiPluginConfig | undefined =
            ctx.config?.plugins?.entries?.kagi?.config;
          const mode = resolveMode(pluginConfig);

          const query = readStringParam(args, "query", { required: true });
          if (!query) {
            return {
              error: "missing_query",
              message: "A search query is required.",
            };
          }

          const count = resolveSearchCount(
            readNumberParam(args, "count", { integer: true }),
            5
          );
          const timeoutMs =
            (resolveSearchTimeoutSeconds(ctx.searchConfig) ?? 30) * 1000;
          const cacheTtlMs = resolveSearchCacheTtlMs(ctx.searchConfig);

          // API mode (stub)
          if (mode === "api") {
            const apiKey =
              pluginConfig?.webSearch?.apiKey ??
              readProviderEnvValue(["KAGI_API_KEY"]) ??
              undefined;
            if (!apiKey) {
              return {
                error: "missing_kagi_api_key",
                message:
                  "Kagi API key not configured. Set KAGI_API_KEY env var or " +
                  "configure plugins.entries.kagi.config.webSearch.apiKey. " +
                  "Note: API mode is not yet implemented — consider using mode: 'session' instead.",
              };
            }
            return await apiSearch(apiKey, query, count);
          }

          // Session mode
          const token = resolveSessionToken(pluginConfig);
          if (!token) {
            return {
              error: "missing_session_token",
              action: "ask_user_for_token",
              message: [
                "Kagi session token not configured.",
                "",
                "ACTION REQUIRED: Ask the user to paste their Kagi Session Link or token.",
                "They can get it from: https://kagi.com/settings/user_details",
                "Accepts either the full URL (https://kagi.com/search?token=...) or just the token.",
                "",
                "Once you have it, write it to ~/.openclaw/kagi-token.json like:",
                '  {"sessionToken": "THE_TOKEN_VALUE", "updatedAt": "2026-01-01T00:00:00Z"}',
                "Then retry the search. No gateway restart needed.",
              ].join("\n"),
            };
          }

          // Check cache
          const cacheKey = buildSearchCacheKey([
            PROVIDER_ID,
            "session",
            query,
            String(count),
          ]);
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

          writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);

          return payload;
        },
      };
    },
  };
}
