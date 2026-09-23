import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { config, isProd } from "../config.js";

const COOKIE_NAME = "dblookup_token";

export function signToken(sub: string): string {
  return jwt.sign({ sub }, config.auth.jwtSecret, {
    expiresIn: `${config.auth.jwtTtlHours}h`,
  });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, config.auth.jwtSecret) as { sub: string };
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

export function requireAuth(req: Request): { sub: string } | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

export function verifyCredentials(username: string, password: string): boolean {
  return (
    username === config.auth.username && password === config.auth.password
  );
}
