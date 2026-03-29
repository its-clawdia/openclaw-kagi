#!/usr/bin/env node

/**
 * Verification script: does a real Kagi /html/search fetch using the
 * two-step cookie auth flow, passes the HTML through the parser, and
 * prints structured results.
 *
 * Usage: KAGI_SESSION_TOKEN=<token> node scripts/verify.mjs [query]
 */

import { parseKagiResultsPage } from "../dist/html-parser.js";
import { extractToken } from "../dist/token-validator.js";

const rawToken = process.env.KAGI_SESSION_TOKEN;
if (!rawToken) {
  console.error("Error: KAGI_SESSION_TOKEN environment variable is not set.");
  console.error("");
  console.error("Usage:");
  console.error("  KAGI_SESSION_TOKEN=<token> node scripts/verify.mjs [query]");
  console.error("");
  console.error("Get your token from: https://kagi.com/settings/user_details");
  process.exit(1);
}

const token = extractToken(rawToken);
const query = process.argv[2] || "openai gpt 5";

console.log(`Searching Kagi for: "${query}"`);
console.log(`Token: ${token.slice(0, 6)}...${token.slice(-4)}`);
console.log("");

const baseHeaders = {
  "User-Agent": "OpenClaw-Kagi/1.0 (Verify Script)",
  Accept: "text/html",
};

const url = new URL("https://kagi.com/html/search");
url.searchParams.set("token", token);
url.searchParams.set("q", query);

try {
  // Step 1: Send token — expect 302 with Set-Cookie
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: baseHeaders,
    redirect: "manual",
  });

  console.log(`Step 1 — HTTP Status: ${response.status} ${response.statusText || ""}`);

  let html;

  if (response.status === 302) {
    const location = response.headers.get("location") ?? "";

    // Invalid token → redirect to signin
    if (location.includes("signin") || location.includes("invalid_token")) {
      console.error(`Redirected to: ${location}`);
      console.error("Token is invalid or expired. Get a new one from:");
      console.error("  https://kagi.com/settings/user_details");
      process.exit(1);
    }

    // Valid token → cookie-set redirect
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
    const redirectUrl = location.startsWith("http")
      ? location
      : `https://kagi.com${location}`;

    console.log(`  Cookie set, following redirect to: ${redirectUrl}`);

    // Step 2: Follow redirect with cookie
    const followUp = await fetch(redirectUrl, {
      method: "GET",
      headers: { ...baseHeaders, Cookie: cookieHeader },
      redirect: "follow",
    });

    console.log(`Step 2 — HTTP Status: ${followUp.status} ${followUp.statusText || ""}`);

    if (!followUp.ok) {
      console.error(`HTTP Error on follow-up: ${followUp.status}`);
      process.exit(1);
    }

    html = await followUp.text();
  } else if (response.ok) {
    html = await response.text();
  } else {
    console.error(`HTTP Error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  console.log(`HTML size: ${html.length} bytes`);
  console.log("");

  const parsed = parseKagiResultsPage(html);

  console.log(`Parsed ${parsed.results.length} results`);
  console.log(`Raw HTML bytes: ${parsed.rawHtmlBytes}`);
  console.log(`Possible breakage: ${parsed.possibleBreakage}`);
  console.log("");

  if (parsed.possibleBreakage) {
    console.error("WARNING: Possible selector breakage detected!");
    console.error("HTML structure sample:");
    console.error(parsed.htmlStructureSample);
    process.exit(1);
  }

  if (parsed.results.length === 0) {
    console.log("No results found (this may be expected for obscure queries).");
    process.exit(0);
  }

  for (let i = 0; i < Math.min(parsed.results.length, 10); i++) {
    const r = parsed.results[i];
    console.log(`--- Result ${i + 1} ---`);
    console.log(`  Title:     ${r.title}`);
    console.log(`  URL:       ${r.url}`);
    console.log(`  Snippet:   ${r.snippet.slice(0, 120)}${r.snippet.length > 120 ? "..." : ""}`);
    if (r.published) console.log(`  Published: ${r.published}`);
    if (r.siteName) console.log(`  Site:      ${r.siteName}`);
    console.log("");
  }

  console.log(`✓ Verification complete — ${parsed.results.length} results parsed successfully`);
} catch (err) {
  console.error("Fetch error:", err.message);
  process.exit(1);
}
