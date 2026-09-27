import { Router } from "express";
import { authGate, requireAdmin } from "../lib/guard.js";
import { listAudit } from "../db/zones.js";

const router = Router();

router.get("/audit/moves", authGate, requireAdmin, (req, res) => {
  const invoice = String(req.query.invoice ?? "").trim();
  const actor = String(req.query.actor ?? "").trim();
  const fromDate = String(req.query.fromDate ?? "").trim();
  const toDate = String(req.query.toDate ?? "").trim();
  const limitRaw = Number(req.query.limit ?? 50);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1),
    200
  );
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

  try {
    const { rows, total } = listAudit({
      invoice: invoice || undefined,
      actor: actor || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit,
      offset,
    });
    res.json({ rows, total, limit, offset });
  } catch (e: any) {
    console.error("[audit]", e.message);
    res.status(500).json({
      error:
        "We couldn't load the audit log right now. Please try again in a moment.",
    });
  }
});

export default router;
