import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { extractToken } from "./token-validator.js";

const STORE_DIR = join(homedir(), ".openclaw");
const STORE_PATH = join(STORE_DIR, "kagi-token.json");

interface TokenStore {
  sessionToken?: string;
  updatedAt?: string;
}

/** Read the persisted session token, if any. */
export function readStoredToken(): string | undefined {
  try {
    const data: TokenStore = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
    return data.sessionToken || undefined;
  } catch {
    return undefined;
  }
}

/** Persist a session token. Accepts a full URL or raw token. */
export function writeStoredToken(tokenOrUrl: string): string {
  const token = extractToken(tokenOrUrl);
  mkdirSync(STORE_DIR, { recursive: true });
  const data: TokenStore = {
    sessionToken: token,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return token;
}

/** Clear the stored token. */
export function clearStoredToken(): void {
  try {
    writeFileSync(STORE_PATH, JSON.stringify({}, null, 2) + "\n", "utf-8");
  } catch {
    // ignore
  }
}
