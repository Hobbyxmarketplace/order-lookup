// Usage: npm run clear-audit
// Deletes every row from move_audit and resets its AUTOINCREMENT counter.
// The server must be stopped first (WAL contention otherwise).

import Database from "better-sqlite3";
import path from "node:path";
import { config } from "../server/config.js";

const dbPath = path.resolve(config.usersDbPath);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("wal_checkpoint(TRUNCATE)");

const before = (db.prepare("SELECT COUNT(*) AS n FROM move_audit").get() as {
  n: number;
}).n;

const result = db.prepare("DELETE FROM move_audit").run();
db.exec("DELETE FROM sqlite_sequence WHERE name = 'move_audit'");
db.pragma("wal_checkpoint(TRUNCATE)");

console.log(
  `[clear-audit] removed ${result.changes} row(s) (${before} visible before checkpoint)`
);
