import "dotenv/config";

/**
 * Centralized configuration. Importing this module loads the .env file, so any
 * module that reads config (models, services) should import from here — this
 * guarantees process.env is populated before clients are constructed.
 */
// Comma-separated allowlist of browser origins permitted to call the API.
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const config = {
  port: process.env.PORT || 3001,
  openaiApiKey: process.env.OPENAI_API_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,
  pineconeIndex: process.env.PINECONE_INDEX,

  // Model + chunking settings, kept in one place.
  embeddingModel: "text-embedding-3-small",
  chatModel: "gpt-4o-mini",
  chatTemperature: 0.2,
  chunkSize: 800,
  chunkOverlap: 150,
  retrievalTopK: 5,
  maxAttempts: 2,

  // --- Security ---
  corsOrigins,
  jsonBodyLimit: "16kb", // reject oversized payloads
  maxQuestionLength: 2000, // cap question length before it reaches the LLM
  // General API rate limit.
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100,
  // Stricter limit for the LLM-backed /ask endpoint (it costs money).
  askRateLimitWindowMs: 15 * 60 * 1000,
  askRateLimitMax: 20,
};
