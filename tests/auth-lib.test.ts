import { describe, it, expect } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv({ JWT_TTL_HOURS: "1" });

const { signToken, verifyToken, maybeRefreshCookie } = await import(
  "../server/lib/auth.js"
);

describe("signToken / verifyToken", () => {
  it("round-trips subject and role", () => {
    const t = signToken("alice", "admin");
    const claims = verifyToken(t);
    expect(claims).toMatchObject({ sub: "alice", role: "admin" });
    expect(typeof claims!.exp).toBe("number");
  });

  it("rejects tampered token", () => {
    const t = signToken("alice", "admin") + "x";
    expect(verifyToken(t)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyToken("not.a.jwt")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("returns null for token signed with different secret", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const bad = jwt.sign({ sub: "x", role: "admin" }, "other-secret-x-x-x-x-x-x", {
      expiresIn: "1h",
    });
    expect(verifyToken(bad)).toBeNull();
  });
});

describe("maybeRefreshCookie", () => {
  function fakeRes() {
    const cookies: any[] = [];
    return {
      cookies,
      cookie: (name: string, val: string, opts: any) =>
        cookies.push({ name, val, opts }),
      // signature match
    } as any;
  }

  it("does NOT refresh a fresh token (>half TTL remaining)", () => {
    const t = signToken("alice", "admin");
    const claims = verifyToken(t)!;
    const res = fakeRes();
    maybeRefreshCookie(res, claims);
    expect(res.cookies).toHaveLength(0);
  });

  it("refreshes a token below the halfway mark", () => {
    // Craft claims that look like they're 45 mins into a 60-min token
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: "alice",
      role: "admin" as const,
      iat: now - 45 * 60,
      exp: now + 15 * 60, // 15 mins left of 60-min ttl → below half
    };
    const res = fakeRes();
    maybeRefreshCookie(res, claims);
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe("dblookup_token");
  });

  it("does not refresh already-expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: "alice",
      role: "admin" as const,
      iat: now - 3600,
      exp: now - 60,
    };
    const res = fakeRes();
    maybeRefreshCookie(res, claims);
    expect(res.cookies).toHaveLength(0);
  });
});
