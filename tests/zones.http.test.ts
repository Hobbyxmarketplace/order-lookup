import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { primeEnv } from "./helpers/setup";

primeEnv();
const { buildTestApp, extractCookie } = await import("./helpers/app");
const { createUser } = await import("../server/db/users.js");

let app: any;
let adminCookie = "";
let staffCookie = "";

beforeAll(async () => {
  app = await buildTestApp();
  createUser("staff1", "staffpass", "staff");
  const a = await request(app)
    .post("/api/login")
    .send({ username: "seed_admin", password: "seed_password" });
  adminCookie = extractCookie(a);
  const s = await request(app)
    .post("/api/login")
    .send({ username: "staff1", password: "staffpass" });
  staffCookie = extractCookie(s);
});

describe("GET /api/zones", () => {
  it("401 without auth", async () => {
    const r = await request(app).get("/api/zones");
    expect(r.status).toBe(401);
  });

  it("staff can list zones", async () => {
    const r = await request(app).get("/api/zones").set("Cookie", staffCookie);
    expect(r.status).toBe(200);
    expect(r.body.zones).toHaveLength(1);
    expect(r.body.zones[0].name).toBe("Zone A");
    expect(r.body.zones[0].is_default).toBe(1);
  });

  it("admin can list zones", async () => {
    const r = await request(app).get("/api/zones").set("Cookie", adminCookie);
    expect(r.status).toBe(200);
  });
});

describe("POST /api/zones (admin only)", () => {
  it("staff gets 403", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", staffCookie)
      .send({ name: "Zone B" });
    expect(r.status).toBe(403);
  });

  it("admin creates a zone", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({ name: "Zone B" });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe("Zone B");
    expect(r.body.is_default).toBe(0);
  });

  it("rejects missing name", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({});
    expect(r.status).toBe(400);
  });

  it("rejects duplicate name (409)", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({ name: "zone b" });
    expect(r.status).toBe(409);
  });

  it("rejects zone name with angle brackets", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({ name: "<script>alert(1)</script>" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/< or >/);
  });

  it("rejects zone name with control characters", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({ name: "Zone\u0000C" });
    expect(r.status).toBe(400);
  });

  it("accepts unicode / emoji in zone name", async () => {
    const r = await request(app)
      .post("/api/zones")
      .set("Cookie", adminCookie)
      .send({ name: "\u{1F3ED} Zone-\u4E2D" });
    expect(r.status).toBe(201);
    expect(r.body.name).toContain("\u4E2D");
  });
});

describe("PATCH /api/zones/:id", () => {
  it("renames a zone", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const b = list.body.zones.find((z: any) => z.name === "Zone B");
    const r = await request(app)
      .patch(`/api/zones/${b.id}`)
      .set("Cookie", adminCookie)
      .send({ name: "Back shelf" });
    expect(r.status).toBe(200);
    const check = await request(app)
      .get("/api/zones")
      .set("Cookie", adminCookie);
    expect(check.body.zones.some((z: any) => z.name === "Back shelf")).toBe(true);
  });

  it("marks a non-default zone as default (singleton preserved)", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const back = list.body.zones.find((z: any) => z.name === "Back shelf");
    const r = await request(app)
      .patch(`/api/zones/${back.id}`)
      .set("Cookie", adminCookie)
      .send({ isDefault: true });
    expect(r.status).toBe(200);
    const check = await request(app)
      .get("/api/zones")
      .set("Cookie", adminCookie);
    const defaults = check.body.zones.filter((z: any) => z.is_default === 1);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Back shelf");

    // restore Zone A as default for delete tests
    const a = check.body.zones.find((z: any) => z.name === "Zone A");
    await request(app)
      .patch(`/api/zones/${a.id}`)
      .set("Cookie", adminCookie)
      .send({ isDefault: true });
  });

  it("staff cannot patch", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const back = list.body.zones.find((z: any) => z.name === "Back shelf");
    const r = await request(app)
      .patch(`/api/zones/${back.id}`)
      .set("Cookie", staffCookie)
      .send({ name: "hax" });
    expect(r.status).toBe(403);
  });
});

describe("DELETE /api/zones/:id", () => {
  it("requires migrateToZoneId", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const back = list.body.zones.find((z: any) => z.name === "Back shelf");
    const r = await request(app)
      .delete(`/api/zones/${back.id}`)
      .set("Cookie", adminCookie)
      .send({});
    expect(r.status).toBe(400);
  });

  it("staff cannot delete", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const back = list.body.zones.find((z: any) => z.name === "Back shelf");
    const a = list.body.zones.find((z: any) => z.name === "Zone A");
    const r = await request(app)
      .delete(`/api/zones/${back.id}`)
      .set("Cookie", staffCookie)
      .send({ migrateToZoneId: a.id });
    expect(r.status).toBe(403);
  });

  it("refuses to delete default", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const a = list.body.zones.find((z: any) => z.name === "Zone A");
    const back = list.body.zones.find((z: any) => z.name === "Back shelf");
    const r = await request(app)
      .delete(`/api/zones/${a.id}`)
      .set("Cookie", adminCookie)
      .send({ migrateToZoneId: back.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/default/i);
  });

  it("deletes and migrates", async () => {
    const list = await request(app).get("/api/zones").set("Cookie", adminCookie);
    const back = list.body.zones.find((z: any) => z.name === "Back shelf");
    const a = list.body.zones.find((z: any) => z.name === "Zone A");

    // Assignment is verifiable at the SQLite layer independent of MariaDB.
    await request(app)
      .post("/api/invoices/H900001/move")
      .set("Cookie", adminCookie)
      .send({ zoneId: back.id });

    const r = await request(app)
      .delete(`/api/zones/${back.id}`)
      .set("Cookie", adminCookie)
      .send({ migrateToZoneId: a.id });
    expect(r.status).toBe(200);

    const after = await request(app)
      .get("/api/zones")
      .set("Cookie", adminCookie);
    expect(after.body.zones.some((z: any) => z.name === "Back shelf")).toBe(
      false
    );
    // Migration correctness (H900001 now points at Zone A) is asserted in
    // zones-db.test.ts against the SQLite layer directly — the /api/zones
    // response returns MariaDB-derived occupancy which doesn't apply to fake
    // test invoices.
  });
});
