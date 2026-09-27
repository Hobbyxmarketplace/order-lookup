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
    expect(r.body).toEqual({ ok: true, user: "seed_admin", role: "admin" });
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
    expect(r.body).toEqual({ user: "seed_admin", role: "admin" });
  });

  it("rejects garbage cookie", async () => {
    const r = await request(app)
      .get("/api/me")
      .set("Cookie", "dblookup_token=not.a.jwt");
    expect(r.status).toBe(401);
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
