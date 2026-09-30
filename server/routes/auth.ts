import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
} from "../lib/auth.js";
import { authGate } from "../lib/guard.js";
import { officeIpAllowed } from "../lib/ip.js";
import { findByUsername, verifyPassword } from "../db/users.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error:
      "Too many login attempts. Please wait a few minutes before trying again.",
  },
});

router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = (req.body || {}) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Please enter your username and password." });
  }
  const user = findByUsername(username);
  if (!user || !user.is_active || !verifyPassword(user, password)) {
    return res
      .status(401)
      .json({ error: "Incorrect username or password." });
  }
  if (user.role === "staff" && !officeIpAllowed(req)) {
    return res
      .status(403)
      .json({ error: "Access restricted to office network" });
  }
  const canMove = user.role === "admin" || user.can_move === 1;
  const token = signToken(user.username, user.role, canMove);
  setAuthCookie(res, token);
  res.json({
    ok: true,
    user: user.username,
    role: user.role,
    can_move: canMove,
  });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", authGate, (req, res) => {
  const claims = (req as any).user;
  const canMove =
    claims.role === "admin" || (claims.canMove ?? true);
  res.json({ user: claims.sub, role: claims.role, can_move: canMove });
});

export default router;
