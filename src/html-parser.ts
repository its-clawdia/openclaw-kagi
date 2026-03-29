import { parseHTML } from "linkedom";
import type {
  KagiSearchResult,
  ParsedSearchPage,
  SelectorsConfig,
} from "./search/types.js";
import selectorsConfig from "./search/selectors.json" with { type: "json" };

export function parseKagiResultsPage(
  html: string,
  selectors: SelectorsConfig = selectorsConfig as SelectorsConfig
): ParsedSearchPage {
  const rawHtmlBytes = Buffer.byteLength(html, "utf-8");
  const { document } = parseHTML(html);

  // Check for "no results" page
  const noResults = document.querySelector(selectors.noResultsIndicator);
  if (noResults) {
    return { results: [], rawHtmlBytes, possibleBreakage: false };
  }

  // Parse organic result containers
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
    const url =
      urlEl?.getAttribute(selectors.organicResults.urlAttribute) ?? "";
    const snippet = snippetEl?.textContent?.trim() ?? "";
    const published =
      publishedEl?.getAttribute("datetime") ??
      publishedEl?.textContent?.trim() ??
      undefined;

    // Skip entries with no title AND no URL
    if (!title && !url) continue;

    results.push({
      title,
      url: normalizeUrl(url),
      snippet,
      published: published || undefined,
      siteName: extractDomain(url),
    });
  }

  // Breakage detection
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

function normalizeUrl(url: string): string {
  if (url.startsWith("/")) return `https://kagi.com${url}`;
  return url;
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function extractStructureSample(document: any): string {
  const body = document.querySelector("body");
  if (!body) return "<no body element found>";

  const html = body.innerHTML
    .replace(/>([^<]+)</g, "> <")
    .replace(/\s+/g, " ")
    .slice(0, 2000);

  return html;
}
