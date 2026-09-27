/**
 * User management CLI.
 *
 *   npm run users list
 *   npm run users add    -- --username alice --password 'x' --role admin
 *   npm run users add    -- --username bob   --password 'y' --role staff
 *   npm run users passwd -- --username alice --password 'new-secret'
 *   npm run users disable -- --username bob
 *   npm run users enable  -- --username bob
 */
import "dotenv/config";
import {
  createUser,
  listUsers,
  setActive,
  setPassword,
  type Role,
} from "../server/db/users.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = val;
        i++;
      }
    }
  }
  return out;
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);

switch (cmd) {
  case "list": {
    const rows = listUsers();
    if (rows.length === 0) {
      console.log("(no users)");
      break;
    }
    const w = (s: string, n: number) => s.padEnd(n);
    console.log(
      w("ID", 4),
      w("USERNAME", 24),
      w("ROLE", 8),
      w("ACTIVE", 8),
      "CREATED"
    );
    for (const r of rows) {
      console.log(
        w(String(r.id), 4),
        w(r.username, 24),
        w(r.role, 8),
        w(r.is_active ? "yes" : "no", 8),
        r.created_at
      );
    }
    break;
  }
  case "add": {
    const { username, password, role } = args;
    if (!username || !password || !role) {
      fail("add requires --username, --password, --role admin|staff");
    }
    if (role !== "admin" && role !== "staff") {
      fail("role must be 'admin' or 'staff'");
    }
    createUser(username, password, role as Role);
    console.log(`added ${role} user '${username}'`);
    break;
  }
  case "passwd": {
    const { username, password } = args;
    if (!username || !password) fail("passwd requires --username and --password");
    setPassword(username, password);
    console.log(`password updated for '${username}'`);
    break;
  }
  case "disable": {
    const { username } = args;
    if (!username) fail("disable requires --username");
    setActive(username, false);
    console.log(`disabled '${username}'`);
    break;
  }
  case "enable": {
    const { username } = args;
    if (!username) fail("enable requires --username");
    setActive(username, true);
    console.log(`enabled '${username}'`);
    break;
  }
  default:
    console.log(
      "usage: npm run users <list|add|passwd|disable|enable> [-- --flags]"
    );
    process.exit(cmd ? 1 : 0);
}
