import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { primeEnv } from "./helpers/setup";

// Allowlist a subnet that does NOT include 127.0.0.1 (supertest uses ::ffff:127.0.0.1)
primeEnv({ OFFICE_IP_ALLOWLIST: "10.0.0.0/24" });

const { buildTestApp } = await import("./helpers/app");
const { createUser } = await import("../server/db/users.js");

let app: any;
beforeAll(async () => {
  app = await buildTestApp();
  createUser("staff1", "staffpass", "staff");
});

describe("office IP gate at login", () => {
  it("admin can log in from non-office IP", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "seed_admin", password: "seed_password" });
    expect(r.status).toBe(200);
  });

  it("staff cannot log in from non-office IP", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "staff1", password: "staffpass" });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "Access restricted to office network" });
    expect(r.headers["set-cookie"]).toBeUndefined();
  });

  it("staff blocked BEFORE cookie is issued", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "staff1", password: "staffpass" });
    expect(r.headers["set-cookie"]).toBeUndefined();
  });

  it("staff still gets 401 (not 403) on wrong password — creds checked first", async () => {
    const r = await request(app)
      .post("/api/login")
      .send({ username: "staff1", password: "WRONG" });
    expect(r.status).toBe(401);
  });
});
