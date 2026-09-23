import type { Request } from "express";
import { config } from "../config.js";

export function clientIp(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "";
  return ip.replace(/^::ffff:/, "");
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n << 8) + x;
  }
  return n >>> 0;
}

function matchCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipN = ipv4ToInt(ip);
  const rangeN = ipv4ToInt(range);
  if (ipN === null || rangeN === null || !Number.isInteger(bits)) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (rangeN & mask);
}

const entries = config.ipAllowlist
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function ipAllowed(req: Request): boolean {
  if (entries.length === 0) return true;
  const ip = clientIp(req);
  if (!ip) return false;
  return entries.some((entry) => matchCidr(ip, entry));
}
