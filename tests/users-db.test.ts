import { describe, it, expect } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv();

const {
  bootstrapAdminIfEmpty,
  createUser,
  findByUsername,
  listUsers,
  setActive,
  setPassword,
  userCount,
  verifyPassword,
} = await import("../server/db/users.js");

describe("users store", () => {
  it("seeds bootstrap admin when empty (using AUTH_USERNAME/AUTH_PASSWORD)", () => {
    // Fresh DB per file → userCount is 0 until bootstrap
    expect(userCount()).toBe(0);
    bootstrapAdminIfEmpty();
    expect(userCount()).toBe(1);
    const u = findByUsername("seed_admin");
    expect(u).toBeTruthy();
    expect(u!.role).toBe("admin");
    expect(verifyPassword(u!, "seed_password")).toBe(true);
  });

  it("bootstrap is idempotent", () => {
    bootstrapAdminIfEmpty();
    bootstrapAdminIfEmpty();
    expect(userCount()).toBe(1);
  });

  it("creates a staff user with bcrypt hash", () => {
    createUser("alice", "hunter2", "staff");
    const u = findByUsername("alice")!;
    expect(u.role).toBe("staff");
    expect(u.password_hash.startsWith("$2")).toBe(true);
    expect(verifyPassword(u, "hunter2")).toBe(true);
    expect(verifyPassword(u, "wrong")).toBe(false);
  });

  it("username is case-insensitive on lookup", () => {
    expect(findByUsername("ALICE")).toBeTruthy();
    expect(findByUsername("Alice")).toBeTruthy();
  });

  it("rejects duplicate username", () => {
    expect(() => createUser("alice", "x", "admin")).toThrow(/UNIQUE|constraint/i);
  });

  it("setPassword updates hash", () => {
    setPassword("alice", "newpass");
    const u = findByUsername("alice")!;
    expect(verifyPassword(u, "newpass")).toBe(true);
    expect(verifyPassword(u, "hunter2")).toBe(false);
  });

  it("setPassword throws on unknown user", () => {
    expect(() => setPassword("nobody", "x")).toThrow(/not found/i);
  });

  it("setActive toggles is_active flag", () => {
    setActive("alice", false);
    expect(findByUsername("alice")!.is_active).toBe(0);
    setActive("alice", true);
    expect(findByUsername("alice")!.is_active).toBe(1);
  });

  it("listUsers returns admin + alice", () => {
    const rows = listUsers();
    const names = rows.map((r) => r.username).sort();
    expect(names).toEqual(["alice", "seed_admin"]);
  });
});
