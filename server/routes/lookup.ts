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
  message: { error: "Too many lookups in a short time. Please wait a moment and try again." },
});

router.get("/lookup", authGate, lookupLimiter, async (req, res) => {
  const invoice = String(req.query.invoice || "").trim();
  if (!invoice)
    return res.status(400).json({ error: "Please enter an invoice number." });
  if (invoice.length > 64) {
    return res
      .status(400)
      .json({ error: "That invoice number is too long. Please check and try again." });
  }
  try {
    const result = await lookupInvoice(invoice);
    if (!result)
      return res
        .status(404)
        .json({ error: `We couldn't find an order for invoice ${invoice}.` });
    res.json(result);
  } catch (e: any) {
    console.error("[lookup]", e.message);
    res
      .status(500)
      .json({ error: "Something went wrong while looking up that invoice. Please try again in a moment." });
  }
});

export default router;
