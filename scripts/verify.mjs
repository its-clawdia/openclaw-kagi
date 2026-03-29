#!/usr/bin/env node

/**
 * End-to-end verification: fetches real Kagi search results via Session Link,
 * parses the HTML, and prints structured output.
 *
 * Usage: KAGI_SESSION_TOKEN=<token> node scripts/verify.mjs [query]
 *        Or reads from ~/.openclaw/kagi.config.json if no env var set.
 */

import { parseKagiResultsPage } from "../dist/html-parser.js";
import { extractToken } from "../dist/token-validator.js";
import { readStoredToken } from "../dist/token-store.js";
import { readFileSync } from "node:fs";

const rawToken = process.env.KAGI_SESSION_TOKEN || readStoredToken();
if (!rawToken) {
  console.error("No Kagi Session Link found.");
  console.error("Set KAGI_SESSION_TOKEN env var or save one with: /kagi token <session-link>");
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

  console.log(`Step 1 — HTTP ${response.status}`);

  let html;

  if (response.status === 302) {
    const location = response.headers.get("location") ?? "";

    if (location.includes("signin") || location.includes("invalid_token")) {
      console.error(`Session Link invalid or expired (redirected to ${location})`);
      console.error("Get a new one from: https://kagi.com/settings/user_details");
      process.exit(1);
    }

    // Valid token — follow redirect with cookie
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
    const redirectUrl = location.startsWith("http")
      ? location
      : `https://kagi.com${location}`;

    console.log(`  Cookie set, following redirect...`);

    const followUp = await fetch(redirectUrl, {
      method: "GET",
      headers: { ...baseHeaders, Cookie: cookieHeader },
      redirect: "follow",
    });

    console.log(`Step 2 — HTTP ${followUp.status}`);

    if (!followUp.ok) {
      console.error(`Follow-up failed: HTTP ${followUp.status}`);
      process.exit(1);
    }

    html = await followUp.text();
  } else if (response.ok) {
    html = await response.text();
  } else {
    console.error(`HTTP ${response.status}`);
    process.exit(1);
  }

  console.log(`HTML: ${html.length} bytes`);
  console.log("");

  const parsed = parseKagiResultsPage(html);

  console.log(`Results: ${parsed.results.length}`);
  console.log(`Breakage detected: ${parsed.possibleBreakage}`);
  console.log("");

  if (parsed.possibleBreakage) {
    console.error("⚠ Possible selector breakage — HTML structure may have changed");
    console.error(parsed.htmlStructureSample);
    process.exit(1);
  }

  for (let i = 0; i < Math.min(parsed.results.length, 5); i++) {
    const r = parsed.results[i];
    console.log(`${i + 1}. ${r.title}`);
    console.log(`   ${r.url}`);
    console.log(`   ${r.snippet.slice(0, 100)}${r.snippet.length > 100 ? "..." : ""}`);
    if (r.published) console.log(`   Published: ${r.published}`);
    console.log("");
  }

  console.log(`✓ ${parsed.results.length} results parsed`);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
