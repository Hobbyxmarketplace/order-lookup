import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  verifyCredentials,
} from "../lib/auth.js";
import { authGate } from "../lib/guard.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = (req.body || {}) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }
  if (!verifyCredentials(username, password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken(username);
  setAuthCookie(res, token);
  res.json({ ok: true, user: username });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", authGate, (req, res) => {
  res.json({ user: (req as any).user.sub });
});

export default router;
