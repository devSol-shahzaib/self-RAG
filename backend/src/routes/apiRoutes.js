import { Router } from "express";
import { askQuestion } from "../controllers/askController.js";
import { runIngest } from "../controllers/ingestController.js";
import { askRateLimiter } from "../middleware/security.js";

const router = Router();

// /ask is LLM-backed and costs money, so it gets a stricter limit on top of
// the general API rate limit applied in app.js.
router.post("/ask", askRateLimiter, askQuestion);
router.post("/ingest", runIngest);

export default router;
