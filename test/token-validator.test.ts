import { describe, it, expect } from "vitest";
import {
  validateTokenFromResponse,
  extractToken,
} from "../src/token-validator.js";

describe("validateTokenFromResponse", () => {
  it("returns valid for normal 200 response", () => {
    const response = new Response("<html>...</html>", { status: 200 });
    const status = validateTokenFromResponse(response);
    expect(status.valid).toBe(true);
  });

  it("detects 302 redirect to signin", () => {
    const response = new Response("", {
      status: 302,
      headers: { Location: "https://kagi.com/signin?p=invalid_token" },
    });
    const status = validateTokenFromResponse(response);
    expect(status).toEqual({ valid: false, reason: "redirect_to_login" });
  });

  it("returns valid for 302 cookie-set redirect (valid token flow)", () => {
    const response = new Response("", {
      status: 302,
      headers: { Location: "/html/search?q=test" },
    });
    const status = validateTokenFromResponse(response);
    expect(status.valid).toBe(true);
  });

  it("reports HTTP errors", () => {
    const response = new Response("", { status: 403, statusText: "Forbidden" });
    const status = validateTokenFromResponse(response);
    expect(status).toEqual({
      valid: false,
      reason: "http_error",
      statusCode: 403,
      detail: "HTTP 403 Forbidden",
    });
  });

  it("reports 500 server error", () => {
    const response = new Response("", {
      status: 500,
      statusText: "Internal Server Error",
    });
    const status = validateTokenFromResponse(response);
    expect(status.valid).toBe(false);
    if (!status.valid) {
      expect(status.reason).toBe("http_error");
      expect(status.statusCode).toBe(500);
    }
  });
});

describe("extractToken", () => {
  it("extracts token from full Session Link URL", () => {
    expect(
      extractToken("https://kagi.com/search?token=ABC123DEF456")
    ).toBe("ABC123DEF456");
  });

  it("returns raw token string as-is", () => {
    expect(extractToken("ABC123DEF456")).toBe("ABC123DEF456");
  });

  it("trims whitespace", () => {
    expect(extractToken("  ABC123DEF456  ")).toBe("ABC123DEF456");
  });

  it("handles URL with extra params", () => {
    expect(
      extractToken("https://kagi.com/search?token=ABC123&q=test")
    ).toBe("ABC123");
  });

  it("returns full string if URL has no token param", () => {
    expect(extractToken("https://kagi.com/search?q=test")).toBe(
      "https://kagi.com/search?q=test"
    );
  });
});
