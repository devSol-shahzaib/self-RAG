import express from "express";
import helmet from "helmet";
import { config } from "./config/index.js";
import { corsMiddleware, apiRateLimiter } from "./middleware/security.js";
import apiRoutes from "./routes/apiRoutes.js";

/** Assemble the Express app: security middleware + routes. No listening here. */
export function createApp() {
  const app = express();

  // Trust the first proxy hop so rate-limit sees real client IPs behind a proxy.
  app.set("trust proxy", 1);

  app.use(helmet()); // secure HTTP headers
  app.use(corsMiddleware); // restrictive CORS allowlist
  app.use(express.json({ limit: config.jsonBodyLimit })); // reject oversized bodies

  app.use("/api", apiRateLimiter, apiRoutes);

  // Central error handler — turns e.g. CORS/body-parse errors into clean JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body too large." });
    }
    if (err?.message?.includes("not allowed by CORS")) {
      return res.status(403).json({ error: "Origin not allowed." });
    }
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error." });
  });

  return app;
}
