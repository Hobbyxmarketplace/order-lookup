import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be a number`);
  return n;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters");
}

export const config = {
  env: optional("NODE_ENV", "development") as "development" | "production",
  host: optional("HOST", "127.0.0.1"),
  port: num("PORT", 3001),

  db: {
    host: required("DB_HOST"),
    port: num("DB_PORT", 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    ssl: bool("DB_SSL", false),
    poolSize: num("DB_POOL_SIZE", 3),
  },

  auth: {
    username: required("AUTH_USERNAME"),
    password: required("AUTH_PASSWORD"),
    jwtSecret,
    jwtTtlHours: num("JWT_TTL_HOURS", 8),
  },

  ipAllowlist: optional("IP_ALLOWLIST", ""),

  lookup: {
    // Cache TTL in seconds for invoice results. 0 disables cache.
    cacheTtlSeconds: num("LOOKUP_CACHE_TTL_SECONDS", 45),
    cacheMax: num("LOOKUP_CACHE_MAX", 500),
  },
} as const;

export const isProd = config.env === "production";
