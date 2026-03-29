import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { extractToken } from "./token-validator.js";

const STORE_PATH = join(homedir(), ".openclaw", "kagi.config.json");

interface KagiConfig {
  sessionToken?: string;
}

export function readStoredToken(): string | undefined {
  try {
    const data: KagiConfig = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
    return data.sessionToken || undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredToken(tokenOrUrl: string): string {
  const token = extractToken(tokenOrUrl);
  mkdirSync(join(homedir(), ".openclaw"), { recursive: true });
  writeFileSync(
    STORE_PATH,
    JSON.stringify({ sessionToken: token } satisfies KagiConfig, null, 2) + "\n",
    "utf-8"
  );
  return token;
}

export function clearStoredToken(): void {
  try {
    writeFileSync(STORE_PATH, "{}\n", "utf-8");
  } catch {
    // ignore if file doesn't exist
  }
}
