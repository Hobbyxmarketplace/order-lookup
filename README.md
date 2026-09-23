# Hobbyx Order Lookup

Lightweight web app for staff to look up an invoice's grading status against a MariaDB.

- **Frontend**: Vite + React + TypeScript (Hobbyx design system, dark mode via `prefers-color-scheme`)
- **Backend**: Express + TypeScript + `mysql2`, single-process, serves the built React app on the same port
- **Auth**: single account (env-configured), JWT in an HttpOnly cookie
- **DB access**: read-only; SQL guard + `SELECT`-only user recommended
- **Deployment target**: any Linux host with Node 20 behind nginx (mirrors existing DO droplet setup)

## Structure

```
server/
  index.ts              # middleware + route mounts + graceful shutdown
  config.ts             # env load + validation (fails fast)
  types.ts              # shared response types
  db/
    pool.ts             # single mysql2 pool + query() + ping()
    read-sql.ts         # loads .sql files from server/sql/
  sql/
    lookup-invoice.sql  # the lookup query (git-tracked, commented)
  services/lookup.ts    # business logic + LRU cache
  routes/               # auth.ts, lookup.ts, health.ts
  lib/                  # auth (JWT), ip (CIDR allowlist), guard (SQL + gates)
src/
  App.tsx, api.ts, main.tsx, styles.css
  components/Layout.tsx
  pages/Login.tsx, Lookup.tsx
scripts/copy-sql.js     # copies server/sql/*.sql -> dist-server/sql/ on build
```

## Local dev

```bash
npm install
cp .env.example .env       # fill in DB + auth secrets
npm run dev                # web on :5173, api on :3001 (proxied)
```

## Build + run

```bash
npm run build              # -> dist/ (React) + dist-server/ (Node)
npm start                  # node dist-server/index.js
```

## Environment

See `.env.example`. Key vars:

| Var | Purpose |
|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MariaDB connection |
| `DB_SSL` | `true` to enable TLS |
| `DB_POOL_SIZE` | Max pool connections (default 3) |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | Login credentials (not DB-backed) |
| `JWT_SECRET` | 16+ char secret for signing cookies |
| `JWT_TTL_HOURS` | Session length (default 8) |
| `IP_ALLOWLIST` | Comma-separated CIDRs/IPs; empty = disabled |
| `LOOKUP_CACHE_TTL_SECONDS` | LRU TTL for invoice lookups (default 45) |
| `LOOKUP_CACHE_MAX` | Max cached invoices (default 500) |

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | DB ping, for uptime monitors |
| POST | `/api/login` | none | Rate-limited 10 / 15 min |
| POST | `/api/logout` | cookie | |
| GET | `/api/me` | cookie | Current user |
| GET | `/api/lookup?invoice=X` | cookie | Rate-limited 30 / min; LRU-cached |

## Security posture

- Helmet CSP/HSTS/nosniff/etc
- `express-rate-limit` on `/login` and `/lookup`
- `trust proxy 1` (one hop = nginx) so per-IP limits are honest
- `SameSite=Strict` cookie, `Secure` in production
- Recommend the DB user have `SELECT`-only grants

## Deploy (Ubuntu + nginx + systemd)

See `docs/deploy.md` (to be added on first deploy).
