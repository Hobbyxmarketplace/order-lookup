// Copy server/sql/*.sql into dist-server/sql/ so read-sql.ts finds them
// at the same relative path in production.
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("server/sql");
const dst = path.resolve("dist-server/sql");

if (!fs.existsSync(src)) {
  console.log("[copy-sql] no server/sql/, skipping");
  process.exit(0);
}

fs.mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith(".sql")) continue;
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
  n++;
}
console.log(`[copy-sql] copied ${n} file(s)`);
