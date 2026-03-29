import type { TokenStatus } from "./search/types.js";

/**
 * Validates a Kagi session token by checking the initial HTTP response.
 *
 * Kagi's Session Link auth flow (verified 2026-03-29):
 * 1. Valid token: 302 redirect to same URL without token, SETS kagi_session cookie
 *    Location: /html/search?q=... (no "signin" in path)
 * 2. Invalid token: 302 redirect to /signin?p=invalid_token
 *
 * fetch() must be called with `redirect: "manual"` to inspect the 302.
 */
export function validateTokenFromResponse(response: Response): TokenStatus {
  if (response.status === 302) {
    const location = response.headers.get("location") ?? "";

    // Invalid token → redirects to signin page
    if (location.includes("signin") || location.includes("invalid_token")) {
      return { valid: false, reason: "redirect_to_login" };
    }

    // Valid token → redirects to search URL (cookie-set flow)
    // This is normal — the caller needs to follow up with the cookie
    return { valid: true };
  }

  // Direct 200 (e.g. when cookies are already set)
  if (response.ok) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: "http_error",
    statusCode: response.status,
    detail: `HTTP ${response.status} ${response.statusText}`,
  };
}

/**
 * Extract token from either a full Session Link URL or a raw token string.
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
