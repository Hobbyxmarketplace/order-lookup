import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { primeEnv } from "./helpers/setup";

primeEnv();
const { buildTestApp, extractCookie } = await import("./helpers/app");
const { createUser } = await import("../server/db/users.js");

let app: any;
let staffCookie = "";
let zoneA = 0;
let zoneB = 0;

beforeAll(async () => {
  app = await buildTestApp();
  createUser("staff1", "staffpass", "staff");
  const s = await request(app)
    .post("/api/login")
    .send({ username: "staff1", password: "staffpass" });
  staffCookie = extractCookie(s);
  // Create Zone B via admin
  const admin = await request(app)
    .post("/api/login")
    .send({ username: "seed_admin", password: "seed_password" });
  const aCookie = extractCookie(admin);
  await request(app)
    .post("/api/zones")
    .set("Cookie", aCookie)
    .send({ name: "Zone B" });
  const list = await request(app).get("/api/zones").set("Cookie", aCookie);
  zoneA = list.body.zones.find((z: any) => z.name === "Zone A").id;
  zoneB = list.body.zones.find((z: any) => z.name === "Zone B").id;
});

describe("POST /api/invoices/:invoice/move", () => {
  it("staff can move an invoice", async () => {
    const r = await request(app)
      .post("/api/invoices/H700001/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: zoneB });
    expect(r.status).toBe(200);
  });

  it("re-move (upsert) works", async () => {
    const r = await request(app)
      .post("/api/invoices/H700001/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: zoneA });
    expect(r.status).toBe(200);
  });

  it("rejects missing zoneId", async () => {
    const r = await request(app)
      .post("/api/invoices/H700001/move")
      .set("Cookie", staffCookie)
      .send({});
    expect(r.status).toBe(400);
  });

  it("rejects non-integer zoneId", async () => {
    const r = await request(app)
      .post("/api/invoices/H700001/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: "abc" });
    expect(r.status).toBe(400);
  });

  it("rejects unknown zone", async () => {
    const r = await request(app)
      .post("/api/invoices/H700001/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: 9999 });
    expect(r.status).toBe(400);
  });

  it("401 without auth", async () => {
    const r = await request(app)
      .post("/api/invoices/H700001/move")
      .send({ zoneId: zoneA });
    expect(r.status).toBe(401);
  });
});

describe("POST /api/invoices/bulk-move", () => {
  it("moves many invoices at once", async () => {
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", staffCookie)
      .send({ invoices: ["H800001", "H800002", "H800003"], zoneId: zoneB });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(3);
  });

  it("dedupes and normalizes input", async () => {
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", staffCookie)
      .send({
        invoices: ["h800001", "H800001", "  H800001  "],
        zoneId: zoneA,
      });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(1);
  });

  it("rejects empty array", async () => {
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", staffCookie)
      .send({ invoices: [], zoneId: zoneA });
    expect(r.status).toBe(400);
  });

  it("rejects non-array invoices", async () => {
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", staffCookie)
      .send({ invoices: "H1", zoneId: zoneA });
    expect(r.status).toBe(400);
  });

  it("enforces 1000-item cap", async () => {
    const invoices = Array.from({ length: 1001 }, (_, i) => `H${i}`);
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", staffCookie)
      .send({ invoices, zoneId: zoneA });
    expect(r.status).toBe(400);
  });

  it("rejects invalid zone", async () => {
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", staffCookie)
      .send({ invoices: ["H1"], zoneId: 9999 });
    expect(r.status).toBe(400);
  });

  it("401 without auth", async () => {
    const r = await request(app)
      .post("/api/invoices/bulk-move")
      .send({ invoices: ["H1"], zoneId: zoneA });
    expect(r.status).toBe(401);
  });
});

describe("GET /api/audit/moves (admin only)", () => {
  it("staff gets 403", async () => {
    const r = await request(app)
      .get("/api/audit/moves")
      .set("Cookie", staffCookie);
    expect(r.status).toBe(403);
  });

  it("admin gets recent moves ordered newest-first with actor + IP", async () => {
    const admin = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    const aCookie = extractCookie(admin);

    // Trigger a fresh move so we have a known row.
    await request(app)
      .post("/api/invoices/AUDIT001/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: zoneB });

    const r = await request(app)
      .get("/api/audit/moves?limit=5")
      .set("Cookie", aCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(r.body.rows.length).toBeGreaterThan(0);
    const latest = r.body.rows[0];
    expect(latest).toHaveProperty("invoice_number");
    expect(latest).toHaveProperty("to_zone_id");
    expect(latest).toHaveProperty("actor_user");
    expect(latest).toHaveProperty("actor_ip");
    expect(latest).toHaveProperty("moved_at");
  });

  it("invoice filter narrows results", async () => {
    const admin = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    const aCookie = extractCookie(admin);

    await request(app)
      .post("/api/invoices/AUDITFILTER/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: zoneB });

    const r = await request(app)
      .get("/api/audit/moves?invoice=AUDITFILTER")
      .set("Cookie", aCookie);
    expect(r.status).toBe(200);
    expect(r.body.rows.every((row: any) =>
      row.invoice_number.toUpperCase().includes("AUDITFILTER")
    )).toBe(true);
  });

  it("records from_zone_id on subsequent moves", async () => {
    const admin = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    const aCookie = extractCookie(admin);

    // First move: from = null (unassigned resolves to default in the UI,
    // but audit row records null since there was no explicit assignment)
    await request(app)
      .post("/api/invoices/AUDITMOVE/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: zoneA });

    // Second move
    await request(app)
      .post("/api/invoices/AUDITMOVE/move")
      .set("Cookie", staffCookie)
      .send({ zoneId: zoneB });

    const r = await request(app)
      .get("/api/audit/moves?invoice=AUDITMOVE")
      .set("Cookie", aCookie);
    expect(r.status).toBe(200);
    const [latest, prev] = r.body.rows;
    expect(latest.from_zone_id).toBe(zoneA);
    expect(latest.to_zone_id).toBe(zoneB);
    expect(prev.from_zone_id).toBe(null);
    expect(prev.to_zone_id).toBe(zoneA);
  });

  it("401 without auth", async () => {
    const r = await request(app).get("/api/audit/moves");
    expect(r.status).toBe(401);
  });
});
