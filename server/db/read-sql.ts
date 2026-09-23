import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, "..", "sql");

const cache = new Map<string, string>();

/**
 * Load a .sql file from server/sql/ (relative name without extension).
 * Files are read once at first access and cached in memory.
 * Comment lines starting with `-- ` are stripped so the query is a single
 * clean statement suitable for mysql2 execute().
 */
export function loadSql(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const file = path.join(SQL_DIR, `${name}.sql`);
  const raw = fs.readFileSync(file, "utf8");
  const cleaned = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .trim()
    .replace(/;\s*$/, "");
  cache.set(name, cleaned);
  return cleaned;
}
