// Waypoint API server: a thin proxy that keeps API keys server-side, adds
// caching/rate limits in front of free public APIs, and serves the built SPA
// in production.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

try {
  process.loadEnvFile(); // .env in the working directory (Node ≥ 20.12)
} catch {
  /* no .env file — rely on the real environment */
}

const { default: express } = await import("express");
const { default: helmet } = await import("helmet");
const { rateLimit } = await import("express-rate-limit");
const { liveRouter } = await import("./routes/live.js");
const { aiRouter, aiConfigured, MODEL } = await import("./routes/ai.js");

const PROD = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
// In dev the API runs beside Vite, so it uses its own API_PORT (tools often set
// PORT for the frontend). In production it serves everything on PORT.
const PORT = Number(PROD ? process.env.PORT || process.env.API_PORT : process.env.API_PORT) || 8787;
const HOST = process.env.HOST || (PROD ? "0.0.0.0" : "127.0.0.1");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Leaflet & Framer Motion set inline styles
        imgSrc: ["'self'", "data:", "blob:", "https://*.basemaps.cartocdn.com"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        workerSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // Only force https when actually deployed behind TLS.
        upgradeInsecureRequests: process.env.FORCE_HTTPS === "1" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(express.json({ limit: "400kb" }));

const json429 = (message) => (req, res) => res.status(429).json({ error: message });
app.use(
  "/api",
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, handler: json429("Too many requests — slow down a little.") }),
);
app.use(
  "/api/ai",
  rateLimit({
    windowMs: 10 * 60_000,
    limit: Number(process.env.AI_RATE_LIMIT) || 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: json429("AI request limit reached — try again in a few minutes."),
  }),
);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ai: aiConfigured(),
    model: MODEL,
    events: Boolean(process.env.TICKETMASTER_API_KEY),
  });
});

app.use("/api", liveRouter);
app.use("/api/ai", aiRouter);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

if (PROD) {
  if (!existsSync(dist)) {
    console.error("dist/ not found — run `npm run build` first.");
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: "1h", immutable: false }));
  app.get("/{*splat}", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Payload too large" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
  console.error(`[api] ${req.method} ${req.path}:`, err.message);
  if (err.name === "UpstreamError") return res.status(502).json({ error: `Live data source unavailable: ${err.message}` });
  res.status(500).json({ error: "Internal error" });
});

app.listen(PORT, HOST, () => {
  console.log(`Waypoint API on http://${HOST}:${PORT} (${PROD ? "production" : "development"})`);
  console.log(aiConfigured() ? `Claude planning enabled (model ${MODEL})` : "Claude planning disabled — set ANTHROPIC_API_KEY in .env");
});
