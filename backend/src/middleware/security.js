import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";

/**
 * CORS restricted to an allowlist of origins (config.corsOrigins). Requests
 * with no Origin header (curl, server-to-server, same-origin) are allowed;
 * browser requests from disallowed origins are rejected.
 */
export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
});

/** General rate limit applied to the whole API. */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/** Stricter rate limit for the LLM-backed /ask endpoint. */
export const askRateLimiter = rateLimit({
  windowMs: config.askRateLimitWindowMs,
  max: config.askRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many questions, please slow down." },
});
