import { Router } from "express";
import { ping } from "../db/pool.js";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    const ok = await ping();
    if (!ok) return res.status(503).json({ ok: false, db: false });
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

export default router;
