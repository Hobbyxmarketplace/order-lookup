import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProd } from "./config.js";
import { ipGate } from "./lib/guard.js";
import { closePool } from "./db/pool.js";
import authRoutes from "./routes/auth.js";
import lookupRoutes from "./routes/lookup.js";
import healthRoutes from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// trust exactly one hop (nginx on the same host). trust=true is unsafe with
// express-rate-limit because clients can spoof X-Forwarded-For.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:"],
        "script-src": ["'self'"],
        "connect-src": ["'self'"],
      },
    },
  })
);
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

// health has no IP gate so uptime monitors work
app.use("/api", healthRoutes);

app.use("/api", ipGate);
app.use("/api", authRoutes);
app.use("/api", lookupRoutes);

// ---- static (React build) ----
const clientDir = path.resolve(__dirname, "..", "dist");
app.use(
  express.static(clientDir, {
    index: false,
    maxAge: isProd ? "1y" : 0,
    immutable: isProd,
    setHeaders: (res, filePath) => {
      // don't cache index.html itself so users always get fresh JS/CSS refs
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[unhandled]", err.message);
    res.status(500).json({ error: "Internal error" });
  }
);

const server = app.listen(config.port, config.host, () => {
  console.log(
    `db-lookup listening on http://${config.host}:${config.port} (${config.env})`
  );
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Force exit after 10s");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
