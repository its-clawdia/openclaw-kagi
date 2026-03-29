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

export type SessionSearchResult =
  | {
      ok: true;
      results: KagiSearchResult[];
    }
  | {
      ok: false;
      error: string;
      errorCode:
        | "token_expired"
        | "token_invalid"
        | "parse_breakage"
        | "fetch_error";
      detail?: string;
      htmlSample?: string;
    };

export async function sessionSearch(
  opts: SessionSearchOptions
): Promise<SessionSearchResult> {
  const url = new URL(KAGI_SEARCH_URL);
  url.searchParams.set("token", opts.token);
  url.searchParams.set("q", opts.query);

  const headers: Record<string, string> = {
    "User-Agent":
      "OpenClaw-Kagi/1.0 (Plugin; +https://github.com/its-clawdia/openclaw-kagi)",
    Accept: "text/html",
  };

  let response: Response;
  try {
    // Step 1: Send request with token — Kagi responds with 302 + Set-Cookie
    response = await fetch(url.toString(), {
      method: "GET",
      headers,
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

  // Validate token from the initial response
  const tokenStatus = validateTokenFromResponse(response);
  if (!tokenStatus.valid) {
    const messages: Record<string, string> = {
      redirect_to_login:
        "Your Kagi session token has expired or is invalid. Ask the user to generate a new Session Link at https://kagi.com/settings/user_details and paste it here. Then run: openclaw configure set plugins.entries.kagi.config.sessionToken \"NEW_TOKEN\" and retry.",
      http_error: `Kagi returned HTTP ${tokenStatus.statusCode}. The session token may be invalid. Ask the user for a new Session Link from https://kagi.com/settings/user_details.`,
    };
    return {
      ok: false,
      error: messages[tokenStatus.reason] ?? "Unknown token error",
      errorCode:
        tokenStatus.reason === "http_error" ? "token_invalid" : "token_expired",
      detail: tokenStatus.detail,
    };
  }

  let html: string;

  if (response.status === 302) {
    // Step 2: Valid token — Kagi set a cookie and redirected.
    // Extract the Set-Cookie and follow the redirect.
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const cookieHeader = setCookies
      .map((c) => c.split(";")[0])
      .join("; ");

    const redirectLocation = response.headers.get("location") ?? "";
    const redirectUrl = redirectLocation.startsWith("http")
      ? redirectLocation
      : `https://kagi.com${redirectLocation}`;

    try {
      const followUp = await fetch(redirectUrl, {
        method: "GET",
        headers: {
          ...headers,
          Cookie: cookieHeader,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs),
      });

      if (!followUp.ok) {
        return {
          ok: false,
          error: `Kagi returned HTTP ${followUp.status} on follow-up request.`,
          errorCode: "fetch_error",
        };
      }

      html = await followUp.text();
    } catch (err) {
      return {
        ok: false,
        error: `Failed to follow Kagi redirect: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: "fetch_error",
      };
    }
  } else {
    // Direct 200 response (already authenticated via cookies)
    html = await response.text();
  }
  const parsed = parseKagiResultsPage(html);

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

  return { ok: true, results: parsed.results.slice(0, opts.count) };
}
