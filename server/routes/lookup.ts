import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authGate } from "../lib/guard.js";
import { lookupInvoice } from "../services/lookup.js";

const router = Router();

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many lookups. Slow down." },
});

router.get("/lookup", authGate, lookupLimiter, async (req, res) => {
  const invoice = String(req.query.invoice || "").trim();
  if (!invoice) return res.status(400).json({ error: "Missing invoice" });
  if (invoice.length > 64) {
    return res.status(400).json({ error: "Invoice too long" });
  }
  try {
    const result = await lookupInvoice(invoice);
    if (!result) return res.status(404).json({ error: "Invoice not found" });
    res.json(result);
  } catch (e: any) {
    console.error("[lookup]", e.message);
    res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
