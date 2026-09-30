import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { config, isProd } from "../config.js";
import type { Role } from "../db/users.js";

const COOKIE_NAME = "dblookup_token";

export interface AuthClaims {
  sub: string;
  role: Role;
  /**
   * Per-user capability: can this account assign invoices to zones?
   * Admins always have this ability regardless of the flag. Older tokens
   * minted before this field was introduced may not carry it — treat
   * missing values as `true` (legacy default) so existing sessions keep
   * working until the next JWT rotation.
   */
  canMove?: boolean;
  iat: number;
  exp: number;
}

export function signToken(
  sub: string,
  role: Role,
  canMove: boolean
): string {
  return jwt.sign({ sub, role, canMove }, config.auth.jwtSecret, {
    expiresIn: `${config.auth.jwtTtlHours}h`,
  });
}

export function verifyToken(token: string): AuthClaims | null {
  try {
    return jwt.verify(token, config.auth.jwtSecret) as AuthClaims;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: config.auth.jwtTtlHours * 3600 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function requireAuth(req: Request): AuthClaims | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Sliding session: if the token has less than half its TTL remaining,
 * mint a fresh one and reset the cookie. Keeps active users logged in;
 * idle sessions still expire on schedule.
 */
export function maybeRefreshCookie(res: Response, claims: AuthClaims): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = claims.exp - nowSec;
  const ttlSec = config.auth.jwtTtlHours * 3600;
  if (remaining > 0 && remaining < ttlSec / 2) {
    setAuthCookie(
      res,
      signToken(claims.sub, claims.role, claims.canMove ?? true)
    );
  }
}
