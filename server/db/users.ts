import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { config } from "../config.js";

export type Role = "admin" | "staff";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  is_active: 0 | 1;
  created_at: string;
}

const dbPath = path.resolve(config.usersDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','staff')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function findByUsername(username: string): UserRow | undefined {
  return db
    .prepare<[string], UserRow>(
      "SELECT * FROM users WHERE username = ? COLLATE NOCASE"
    )
    .get(username);
}

export function listUsers(): Pick<
  UserRow,
  "id" | "username" | "role" | "is_active" | "created_at"
>[] {
  return db
    .prepare(
      "SELECT id, username, role, is_active, created_at FROM users ORDER BY id"
    )
    .all() as any;
}

export function createUser(
  username: string,
  password: string,
  role: Role
): void {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
  ).run(username, hash, role);
}

export function setPassword(username: string, password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  const res = db
    .prepare(
      "UPDATE users SET password_hash = ? WHERE username = ? COLLATE NOCASE"
    )
    .run(hash, username);
  if (res.changes === 0) throw new Error(`User not found: ${username}`);
}

export function setActive(username: string, active: boolean): void {
  const res = db
    .prepare(
      "UPDATE users SET is_active = ? WHERE username = ? COLLATE NOCASE"
    )
    .run(active ? 1 : 0, username);
  if (res.changes === 0) throw new Error(`User not found: ${username}`);
}

export function verifyPassword(row: UserRow, password: string): boolean {
  return bcrypt.compareSync(password, row.password_hash);
}

export function userCount(): number {
  return (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number })
    .n;
}

/**
 * On first ever startup, seed a bootstrap admin from AUTH_USERNAME/AUTH_PASSWORD
 * so a fresh deploy is not locked out. Safe to call every boot: only acts
 * when the users table is empty.
 */
export function bootstrapAdminIfEmpty(): void {
  if (userCount() > 0) return;
  const u = process.env.AUTH_USERNAME;
  const p = process.env.AUTH_PASSWORD;
  if (!u || !p) return;
  createUser(u, p, "admin");
  console.log(`[users] seeded bootstrap admin '${u}'`);
}
