import { describe, it, expect } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv();

const { clientIp, officeIpAllowed } = await import("../server/lib/ip.js");

function fakeReq(ip: string) {
  return { ip, socket: { remoteAddress: ip } } as any;
}

describe("clientIp", () => {
  it("strips IPv4-mapped IPv6 prefix", () => {
    expect(clientIp(fakeReq("::ffff:203.0.113.5"))).toBe("203.0.113.5");
  });

  it("returns bare IPv4", () => {
    expect(clientIp(fakeReq("10.0.0.1"))).toBe("10.0.0.1");
  });

  it("falls back to socket.remoteAddress", () => {
    const req = { ip: undefined, socket: { remoteAddress: "10.0.0.2" } } as any;
    expect(clientIp(req)).toBe("10.0.0.2");
  });
});

describe("officeIpAllowed (env-empty)", () => {
  it("returns true when allowlist is empty (gate disabled)", () => {
    expect(officeIpAllowed(fakeReq("1.2.3.4"))).toBe(true);
    expect(officeIpAllowed(fakeReq("127.0.0.1"))).toBe(true);
  });
});
