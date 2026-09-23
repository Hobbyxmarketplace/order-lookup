import type { Request, Response, NextFunction } from "express";
import { ipAllowed } from "./ip.js";
import { requireAuth } from "./auth.js";

export function ipGate(req: Request, res: Response, next: NextFunction) {
  if (!ipAllowed(req)) {
    res.status(403).json({ error: "IP not allowed" });
    return;
  }
  next();
}

export function authGate(req: Request, res: Response, next: NextFunction) {
  const user = requireAuth(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { user?: { sub: string } }).user = user;
  next();
}

const IDENT = /^[A-Za-z0-9_]+$/;

export function safeIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `\`${name}\``;
}

const READ_ONLY_LEAD = /^(select|show|describe|desc|explain|with)\b/i;
const BANNED =
  /\b(insert|update|delete|drop|truncate|alter|create|rename|grant|revoke|call|load|into\s+outfile|into\s+dumpfile|handler|lock|unlock|set\s+password)\b/i;

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new Error("Empty query");
  if (trimmed.includes(";")) throw new Error("Multiple statements not allowed");
  if (!READ_ONLY_LEAD.test(trimmed)) {
    throw new Error("Only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH queries allowed");
  }
  if (BANNED.test(trimmed)) {
    throw new Error("Query contains a disallowed keyword");
  }
}
