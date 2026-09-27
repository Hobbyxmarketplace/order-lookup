import express from "express";
import cookieParser from "cookie-parser";

/**
 * Build a minimal Express app that mounts our real route modules.
 * Skips helmet/compression/static assets — pointless overhead for tests.
 * MUST be called AFTER primeEnv().
 */
export async function buildTestApp(): Promise<express.Express> {
  // Re-import fresh each time. In vitest with isolate:true, each test file
  // already runs in its own worker with its own module graph.
  const { default: authRoutes } = await import("../../server/routes/auth.js");
  const { default: lookupRoutes } = await import("../../server/routes/lookup.js");
  const { default: healthRoutes } = await import("../../server/routes/health.js");
  const { default: zoneRoutes } = await import("../../server/routes/zones.js");
  const { default: invoiceRoutes } = await import("../../server/routes/invoices.js");
  const { default: auditRoutes } = await import("../../server/routes/audit.js");
  const { bootstrapAdminIfEmpty } = await import("../../server/db/users.js");
  const { bootstrapDefaultZoneIfEmpty } = await import("../../server/db/zones.js");

  bootstrapAdminIfEmpty();
  bootstrapDefaultZoneIfEmpty();

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", healthRoutes);
  app.use("/api", authRoutes);
  app.use("/api", lookupRoutes);
  app.use("/api", zoneRoutes);
  app.use("/api", invoiceRoutes);
  app.use("/api", auditRoutes);

  // Mirror the production error handler so JSON parse/size failures return
  // friendly 400/413 instead of 500.
  app.use(
    (
      err: Error & { type?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err.type === "entity.parse.failed") {
        return res
          .status(400)
          .json({ error: "That request wasn't in a format we could read." });
      }
      if (err.type === "entity.too.large") {
        return res
          .status(413)
          .json({ error: "That request is too large." });
      }
      res.status(500).json({ error: "Internal error" });
    }
  );
  return app;
}

/** Extract the auth cookie value from a supertest response. */
export function extractCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const arr = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const c = arr.find((s) => s.startsWith("dblookup_token="));
  if (!c) throw new Error("No auth cookie in response");
  return c.split(";")[0];
}
