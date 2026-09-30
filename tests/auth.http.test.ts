import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { primeEnv } from "./helpers/setup";

primeEnv();
const { buildTestApp, extractCookie } = await import("./helpers/app");
const { createUser, setActive } = await import("../server/db/users.js");

let app: any;
beforeAll(async () => {
  app = await buildTestApp();
  createUser("staff1", "staffpass", "staff");
  createUser("disabled_user", "x", "staff");
  setActive("disabled_user", false);
});

describe("POST /api/login", () => {
  it("succeeds with valid admin credentials", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      user: "seed_admin",
      role: "admin",
      can_move: true,
    });
    expect(r.headers["set-cookie"]).toBeTruthy();
  });

  it("succeeds with valid staff credentials", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "staff1", password: "staffpass" });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("staff");
  });

  it("case-insensitive username", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "SEED_ADMIN", password: "seed_password" });
    expect(r.status).toBe(200);
  });

  it("rejects wrong password", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "nope" });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/incorrect|invalid/i);
  });

  it("rejects unknown username", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "ghost", password: "x" });
    expect(r.status).toBe(401);
  });

  it("rejects disabled user even with right password", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "disabled_user", password: "x" });
    expect(r.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    const r = await request(app).post("/api/login").send({});
    expect(r.status).toBe(400);
  });
});

describe("GET /api/me", () => {
  it("401 without cookie", async () => {
    const r = await request(app).get("/api/me");
    expect(r.status).toBe(401);
  });

  it("returns user + role with valid cookie", async () => {
    const login = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    const cookie = extractCookie(login);
    const r = await request(app).get("/api/me").set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      user: "seed_admin",
      role: "admin",
      can_move: true,
    });
  });

  it("rejects garbage cookie", async () => {
    const r = await request(app)
      .get("/api/me")
      .set("Cookie", "dblookup_token=not.a.jwt");
    expect(r.status).toBe(401);
  });
});

// Per-user can_move capability. staff1 starts with the default (allowed).
// When we revoke it via setCanMove(), the move endpoints must 403 and
// /api/me should surface can_move=false.
describe("can_move capability", () => {
  it("staff with can_move revoked cannot move invoices", async () => {
    const { setCanMove } = await import("../server/db/users.js");
    setCanMove("staff1", false);

    const login = await request(app)
      .post("/api/login")
      .send({ username: "staff1", password: "staffpass" });
    expect(login.body.can_move).toBe(false);
    const cookie = extractCookie(login);

    const me = await request(app).get("/api/me").set("Cookie", cookie);
    expect(me.body.can_move).toBe(false);

    const single = await request(app)
      .post("/api/invoices/H999999/move")
      .set("Cookie", cookie)
      .send({ zoneId: 1 });
    expect(single.status).toBe(403);

    const bulk = await request(app)
      .post("/api/invoices/bulk-move")
      .set("Cookie", cookie)
      .send({ invoices: ["H999999"], zoneId: 1 });
    expect(bulk.status).toBe(403);

    const list = await request(app)
      .get("/api/invoices/ready-for-pickup")
      .set("Cookie", cookie);
    expect(list.status).toBe(403);

    // Restore for any downstream tests in this file.
    setCanMove("staff1", true);
  });

  it("admin ignores can_move flag (always allowed)", async () => {
    const { setCanMove } = await import("../server/db/users.js");
    // Even if we tried to strip can_move from an admin, the guard should
    // let admins through unconditionally. We do NOT expose a way to set
    // can_move on admins in the CLI, but the guard must still be robust.
    setCanMove("seed_admin", false);
    const login = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    expect(login.body.can_move).toBe(true);
    setCanMove("seed_admin", true);
  });
});

describe("POST /api/logout", () => {
  it("clears the cookie", async () => {
    const r = await request(app).post("/api/logout");
    expect(r.status).toBe(200);
    const setCookie = r.headers["set-cookie"];
    const arr = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
    expect(arr.some((c) => /dblookup_token=;/.test(c))).toBe(true);
  });
});

describe("malformed request bodies", () => {
  it("returns 400 (not 500) for invalid JSON", async () => {
    const r = await request(app)
      .post("/api/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(r.status).toBe(400);
    const body = r.body?.error ?? r.text ?? "";
    expect(String(body)).toMatch(/format we could read/i);
  });
});
