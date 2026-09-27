import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/**
 * Prime process.env BEFORE importing any code that reads from config.ts.
 * Every test file that talks to auth/zones must call `primeEnv()` at the top
 * of the file — before any `import` from `../server/...`.
 *
 *   import { primeEnv } from "./helpers/setup";
 *   primeEnv();
 *   const { default: authRoutes } = await import("../server/routes/auth.js");
 *
 * We use dynamic imports throughout tests to defer resolution until env is set.
 */
export function primeEnv(overrides: Record<string, string> = {}): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hobbyx-test-"));
  const dbPath = path.join(tmp, "app.db");

  const defaults: Record<string, string> = {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USER: "test",
    DB_PASSWORD: "test",
    DB_NAME: "test",
    JWT_SECRET: "a".repeat(32),
    JWT_TTL_HOURS: "8",
    AUTH_USERNAME: "seed_admin",
    AUTH_PASSWORD: "seed_password",
    USERS_DB_PATH: dbPath,
    OFFICE_IP_ALLOWLIST: "",
    LOOKUP_CACHE_TTL_SECONDS: "0",
    LOOKUP_CACHE_MAX: "10",
  };

  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    process.env[k] = v;
  }

  return dbPath;
}

export function randomToken(): string {
  return crypto.randomBytes(8).toString("hex");
}
