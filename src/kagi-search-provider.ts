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
import { sessionSearch } from "./search/session-search.js";
import { readStoredToken } from "./token-store.js";

const PROVIDER_ID = "kagi";
const TOKEN_FILE = "~/.openclaw/kagi.config.json";

export function createKagiWebSearchProvider() {
  return {
    id: PROVIDER_ID,
    label: "Kagi Search",
    hint: "Privacy-first search via Session Links",

    credentialLabel: "Kagi Session Token",
    envVars: [] as string[],
    placeholder: "paste token from Session Link URL",
    signupUrl: "https://kagi.com/settings/user_details",
    docsUrl: "https://github.com/its-clawdia/openclaw-kagi#readme",
    autoDetectOrder: 50,
    credentialPath: TOKEN_FILE,
    inactiveSecretPaths: [TOKEN_FILE],

    getCredentialValue: (searchConfig: any) =>
      getScopedCredentialValue(searchConfig, PROVIDER_ID),
    setCredentialValue: (target: any, value: any) =>
      setScopedCredentialValue(target, PROVIDER_ID, value),
    getConfiguredCredentialValue: () => readStoredToken(),
    setConfiguredCredentialValue: () => {},
    applySelectionConfig: (config: any) =>
      enablePluginInConfig(config, PROVIDER_ID).config,

    createTool: (ctx: any) => ({
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
        const timeoutMs =
          (resolveSearchTimeoutSeconds(ctx.searchConfig) ?? 30) * 1000;
        const cacheTtlMs = resolveSearchCacheTtlMs(ctx.searchConfig);

        const token = readStoredToken();
        if (!token) {
          return {
            error: "missing_session_token",
            action: "ask_user_for_token",
            message: [
              "Kagi session token not configured.",
              "",
              "Ask the user to paste their Kagi Session Link or token.",
              "Get it from: https://kagi.com/settings/user_details",
              "Accepts the full URL or just the token value.",
              "",
              `Once you have it, write it to ${TOKEN_FILE}:`,
              '  {"sessionToken": "THE_TOKEN_VALUE"}',
              "Then retry the search. No restart needed.",
            ].join("\n"),
          };
        }

        // Cache check
        const cacheKey = buildSearchCacheKey([PROVIDER_ID, query, String(count)]);
        const cached = readCachedSearchPayload(cacheKey);
        if (cached) return cached;

        // Search
        const start = Date.now();
        const result = await sessionSearch({ token, query, count, timeoutMs });

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
    }),
  };
}
