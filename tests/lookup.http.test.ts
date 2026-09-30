/**
 * Integration tests that hit the REAL, read-only production MariaDB.
 * Skip by exporting SKIP_REMOTE=1 before `npm test`.
 *
 * Assumes .env has valid DB_* credentials and the following invoices exist:
 *   H136260 → Picked Up
 *   H136582 → Ready for Pickup
 *   H140017 → Ready for Pickup
 */
import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Do NOT call primeEnv — we want the real DB creds from .env
process.env.NODE_ENV = "test";
process.env.LOOKUP_CACHE_TTL_SECONDS = "0";
process.env.USERS_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "hobbyx-test-lookup-")),
  "app.db"
);
process.env.OFFICE_IP_ALLOWLIST = "";

const skip = process.env.SKIP_REMOTE === "1";
const d = skip ? describe.skip : describe;

const { buildTestApp, extractCookie } = await import("./helpers/app");
const { createUser } = await import("../server/db/users.js");

let app: any;
let adminCookie = "";

beforeAll(async () => {
  if (skip) return;
  app = await buildTestApp();
  const login = await request(app)
    .post("/api/login")
    .send({
      username: process.env.AUTH_USERNAME,
      password: process.env.AUTH_PASSWORD,
    });
  adminCookie = extractCookie(login);
  // Sanity check we can auth
  expect(login.status).toBe(200);
});

d("GET /api/lookup", () => {
  it("returns Picked Up for H136260 with no zone", async () => {
    const r = await request(app)
      .get("/api/lookup?invoice=H136260")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("Picked Up");
    expect(r.body.zone).toBeNull();
    expect(r.body.owner_email).toBeTruthy();
    expect(r.body.pickup_date).toBeTruthy();
  });

  it("returns Ready for Pickup for H136582 WITH zone", async () => {
    const r = await request(app)
      .get("/api/lookup?invoice=H136582")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("Ready for Pickup");
    expect(r.body.zone).toMatchObject({ name: "Zone A" });
    expect(r.body.pickup_ready_at).toBeTruthy();
  });

  it("returns 404 for unknown invoice", async () => {
    const r = await request(app)
      .get("/api/lookup?invoice=NOTREAL999")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(404);
  });

  it("rejects missing invoice", async () => {
    const r = await request(app)
      .get("/api/lookup?invoice=")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(400);
  });

  it("rejects overly long invoice", async () => {
    const r = await request(app)
      .get("/api/lookup?invoice=" + "A".repeat(65))
      .set("Cookie", adminCookie);
    expect(r.status).toBe(400);
  });

  it("401 without auth", async () => {
    const r = await request(app).get("/api/lookup?invoice=H136260");
    expect(r.status).toBe(401);
  });

  it("case-insensitive invoice match", async () => {
    const r = await request(app)
      .get("/api/lookup?invoice=h136260")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.invoice).toBe("H136260");
  });

  // Regression: digits-only search must still populate items count.
  // Previously count-items.sql was called with the raw '136582' and
  // returned 0 because it did exact match, not a digits-only fallback.
  it("digits-only search returns items count identical to prefixed search", async () => {
    const [prefixed, digits] = await Promise.all([
      request(app).get("/api/lookup?invoice=H136582").set("Cookie", adminCookie),
      request(app).get("/api/lookup?invoice=136582").set("Cookie", adminCookie),
    ]);
    expect(prefixed.status).toBe(200);
    expect(digits.status).toBe(200);
    expect(digits.body.invoice).toBe(prefixed.body.invoice);
    expect(digits.body.items).toBe(prefixed.body.items);
    expect(digits.body.items).toBeGreaterThan(0);
  });
});

d("Zone attaches only on Ready-for-Pickup, follows moves", () => {
  let zoneB = 0;
  beforeAll(async () => {
    if (skip) return;
    await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({ name: "Zone B" });
    const list = await request(app)
      .get("/api/zones")
      .set("Cookie", adminCookie);
    zoneB = list.body.zones.find((z: any) => z.name === "Zone B").id;
  });

  it("H136582 moves to Zone B and lookup reflects it", async () => {
    await request(app)
      .post("/api/invoices/H136582/move")
      .set("Cookie", adminCookie)
      .send({ zoneId: zoneB });
    const r = await request(app)
      .get("/api/lookup?invoice=H136582")
      .set("Cookie", adminCookie);
    expect(r.body.zone.name).toBe("Zone B");
  });
});

d("GET /api/invoices/ready-for-pickup", () => {
  it("returns paged Ready-for-Pickup rows with zone", async () => {
    const r = await request(app)
      .get("/api/invoices/ready-for-pickup?limit=5")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(typeof r.body.total).toBe("number");
    if (r.body.items.length > 0) {
      const it = r.body.items[0];
      expect(it).toHaveProperty("invoice");
      expect(it).toHaveProperty("submission_number");
      expect(it).toHaveProperty("owner_email");
      expect(it).toHaveProperty("pickup_ready_at");
      expect(it.zone).toHaveProperty("name");
    }
  });

  it("search filter works", async () => {
    const r = await request(app)
      .get("/api/invoices/ready-for-pickup?search=H136582")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.items.every((i: any) => i.invoice.includes("H136582"))).toBe(
      true
    );
  });

  it("respects limit", async () => {
    const r = await request(app)
      .get("/api/invoices/ready-for-pickup?limit=2")
      .set("Cookie", adminCookie);
    expect(r.body.items.length).toBeLessThanOrEqual(2);
  });

  it("caps limit at 200", async () => {
    const r = await request(app)
      .get("/api/invoices/ready-for-pickup?limit=99999")
      .set("Cookie", adminCookie);
    expect(r.body.limit).toBeLessThanOrEqual(200);
  });

  it("401 without auth", async () => {
    const r = await request(app).get("/api/invoices/ready-for-pickup");
    expect(r.status).toBe(401);
  });

  it("zoneIds filter returns only invoices in those zones", async () => {
    // Fetch total universe first.
    const all = await request(app)
      .get("/api/invoices/ready-for-pickup?limit=200")
      .set("Cookie", adminCookie);
    expect(all.status).toBe(200);
    if (all.body.items.length === 0) return; // nothing ready in DB
    const someZoneId = all.body.items[0].zone.id as number;

    const filtered = await request(app)
      .get(`/api/invoices/ready-for-pickup?limit=200&zoneIds=${someZoneId}`)
      .set("Cookie", adminCookie);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThan(0);
    for (const item of filtered.body.items) {
      expect(item.zone.id).toBe(someZoneId);
    }
    expect(filtered.body.total).toBeLessThanOrEqual(all.body.total);
  });

  it("zoneIds filter with unknown id returns empty", async () => {
    const r = await request(app)
      .get("/api/invoices/ready-for-pickup?zoneIds=9999999")
      .set("Cookie", adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(0);
    expect(r.body.total).toBe(0);
  });
});

d("GET /api/health", () => {
  it("returns db:true when MariaDB reachable", async () => {
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, db: true });
  });
});
