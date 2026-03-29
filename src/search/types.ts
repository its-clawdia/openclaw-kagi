/** A single parsed search result */
export interface KagiSearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
  siteName?: string;
}

/** Output of the HTML parser */
export interface ParsedSearchPage {
  results: KagiSearchResult[];
  totalResults?: number;
  rawHtmlBytes: number;
  possibleBreakage: boolean;
  htmlStructureSample?: string;
}

/** Token validation state */
export type TokenStatus =
  | { valid: true }
  | {
      valid: false;
      reason: "redirect_to_login" | "login_form_detected" | "http_error";
      statusCode?: number;
      detail?: string;
    };

/** Search mode */
export type KagiSearchMode = "session" | "api";

/** Plugin-specific config shape */
export interface KagiPluginConfig {
  mode?: KagiSearchMode;
  sessionToken?: string;
  webSearch?: {
    apiKey?: string;
  };
}

/** Selector definition for a single search result */
export interface ResultSelectors {
  resultContainer: string;
  title: string;
  url: string;
  urlAttribute: string;
  snippet: string;
  published?: string;
}

/** Shape of selectors.json */
export interface SelectorsConfig {
  version: number;
  lastVerified: string;
  searchUrl: string;
  organicResults: ResultSelectors;
  groupedResults?: {
    resultContainer: string;
    title: string;
    url: string;
    urlAttribute: string;
  };
  noResultsIndicator: string;
  loginIndicators: string[];
  minExpectedPageBytes: number;
}
