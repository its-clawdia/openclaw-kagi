import { readStoredToken, writeStoredToken, clearStoredToken } from "./token-store.js";
import { extractToken } from "./token-validator.js";

const SETTINGS_URL = "https://kagi.com/settings/user_details";

export function createKagiCommands() {
  return {
    name: "kagi",
    description:
      "Manage Kagi search: /kagi token <session-link>, /kagi status, /kagi clear",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: { args?: string }) => {
      const args = (ctx.args ?? "").trim();
      const [subcommand, ...rest] = args.split(/\s+/);
      const value = rest.join(" ").trim();

      switch (subcommand?.toLowerCase()) {
        case "token": {
          if (!value) {
            return {
              text: `Usage: /kagi token <session-link>\n\nPaste your Session Link from ${SETTINGS_URL}`,
            };
          }
          const token = writeStoredToken(value);
          const masked = token.slice(0, 6) + "..." + token.slice(-4);
          return {
            text: `✅ Kagi Session Link saved (${masked}). Web search will now use Kagi.`,
          };
        }

        case "status": {
          const token = readStoredToken();
          if (!token) {
            return {
              text: `No Kagi Session Link configured.\n\nSet one with: /kagi token <session-link>\nGet yours from: ${SETTINGS_URL}`,
            };
          }
          const masked = token.slice(0, 6) + "..." + token.slice(-4);
          return { text: `Kagi Session Link configured: ${masked}` };
        }

        case "clear": {
          clearStoredToken();
          return { text: "Kagi Session Link removed." };
        }

        default: {
          return {
            text: [
              "Usage:",
              "  /kagi token <session-link>  — Save your Kagi Session Link",
              "  /kagi status                — Check if a Session Link is configured",
              "  /kagi clear                 — Remove saved Session Link",
              "",
              `Get your Session Link from: ${SETTINGS_URL}`,
            ].join("\n"),
          };
        }
      }
    },
  };
}
