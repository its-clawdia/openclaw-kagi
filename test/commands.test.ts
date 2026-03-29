import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createKagiCommands } from "../src/commands.js";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".openclaw", "kagi.config.json");
const command = createKagiCommands();

function cleanup() {
  try {
    unlinkSync(STORE_PATH);
  } catch {}
}

describe("/kagi command", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe("/kagi (no args)", () => {
    it("shows usage help", async () => {
      const result = await command.handler({ args: "" });
      expect(result.text).toContain("/kagi token");
      expect(result.text).toContain("/kagi status");
      expect(result.text).toContain("/kagi clear");
    });
  });

  describe("/kagi token", () => {
    it("saves a raw token", async () => {
      const result = await command.handler({ args: "token ABC123DEF" });
      expect(result.text).toContain("✅");
      expect(result.text).toContain("ABC1");
      expect(result.text).toContain("✅");

      const stored = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
      expect(stored.sessionToken).toBe("ABC123DEF");
    });

    it("extracts token from a full Session Link URL", async () => {
      const result = await command.handler({
        args: "token https://kagi.com/search?token=MY_TOKEN_VALUE",
      });
      expect(result.text).toContain("✅");

      const stored = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
      expect(stored.sessionToken).toBe("MY_TOKEN_VALUE");
    });

    it("shows usage when no value provided", async () => {
      const result = await command.handler({ args: "token" });
      expect(result.text).toContain("Usage");
      expect(result.text).toContain("session-link");
    });
  });

  describe("/kagi status", () => {
    it("shows 'not configured' when no token", async () => {
      const result = await command.handler({ args: "status" });
      expect(result.text).toContain("No Kagi Session Link configured");
    });

    it("shows masked token when configured", async () => {
      writeFileSync(
        STORE_PATH,
        JSON.stringify({ sessionToken: "ABCDEF123456" }),
      );
      const result = await command.handler({ args: "status" });
      expect(result.text).toContain("ABCDEF...3456");
    });
  });

  describe("/kagi clear", () => {
    it("removes the stored token", async () => {
      writeFileSync(
        STORE_PATH,
        JSON.stringify({ sessionToken: "ABCDEF123456" }),
      );
      const result = await command.handler({ args: "clear" });
      expect(result.text).toContain("removed");

      const stored = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
      expect(stored.sessionToken).toBeUndefined();
    });

    it("works even when no token exists", async () => {
      const result = await command.handler({ args: "clear" });
      expect(result.text).toContain("removed");
    });
  });

  describe("unknown subcommand", () => {
    it("shows usage", async () => {
      const result = await command.handler({ args: "foo" });
      expect(result.text).toContain("Usage");
    });
  });
});
