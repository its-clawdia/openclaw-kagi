import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseKagiResultsPage } from "../src/html-parser.js";

async function readFixture(name: string): Promise<string> {
  return readFile(join(import.meta.dirname, "fixtures", name), "utf-8");
}

describe("parseKagiResultsPage", () => {
  it("parses normal search results", async () => {
    const html = await readFixture("kagi-results-normal.html");
    const result = parseKagiResultsPage(html);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.possibleBreakage).toBe(false);
    for (const r of result.results) {
      expect(r.title).toBeTruthy();
      expect(r.url).toMatch(/^https?:\/\//);
    }
  });

  it("extracts titles, URLs, and snippets from results", async () => {
    const html = await readFixture("kagi-results-normal.html");
    const result = parseKagiResultsPage(html);
    const first = result.results[0];
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.url).toMatch(/^https?:\/\//);
    expect(first.snippet.length).toBeGreaterThan(0);
  });

  it("extracts siteName from URL", async () => {
    const html = await readFixture("kagi-results-normal.html");
    const result = parseKagiResultsPage(html);
    const withSite = result.results.find((r) => r.siteName);
    expect(withSite).toBeDefined();
    expect(withSite!.siteName).not.toContain("www.");
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

  it("handles sparse results page", async () => {
    const html = await readFixture("kagi-results-sparse.html");
    const result = parseKagiResultsPage(html);
    // Sparse page should still parse some results (or detect breakage if truly empty)
    expect(result.rawHtmlBytes).toBeGreaterThan(0);
  });

  it("normalizes relative URLs", () => {
    const html = `
      <html><body>
        <div class="_0_SRI search-result">
          <a class="__sri_title_link" href="/redirect?url=example">Test Title</a>
          <div class="__sri-desc">Test snippet</div>
        </div>
      </body></html>
    `;
    const result = parseKagiResultsPage(html);
    for (const r of result.results) {
      expect(r.url).toMatch(/^https?:\/\//);
    }
  });

  it("skips entries with no title and no URL", () => {
    const html = `
      <html><body>
        <div class="_0_SRI search-result">
          <div class="__sri-desc">Just a snippet, no title or URL</div>
        </div>
      </body></html>
    `;
    const result = parseKagiResultsPage(html);
    expect(result.results).toHaveLength(0);
  });

  it("records rawHtmlBytes", async () => {
    const html = await readFixture("kagi-results-normal.html");
    const result = parseKagiResultsPage(html);
    expect(result.rawHtmlBytes).toBeGreaterThan(5000);
  });

  it("parses published dates when present", async () => {
    const html = await readFixture("kagi-results-normal.html");
    const result = parseKagiResultsPage(html);
    const withDate = result.results.find((r) => r.published);
    // Dates are optional — just verify the field is a string if present
    if (withDate) {
      expect(typeof withDate.published).toBe("string");
      expect(withDate.published!.length).toBeGreaterThan(0);
    }
  });
});
