import { ask } from "../services/ragService.js";
import { config } from "../config/index.js";

/** POST /api/ask — validate input, delegate to the RAG service. */
export async function askQuestion(req, res) {
  const { question, history, warned, questionsUsed } = req.body ?? {};

  if (typeof question !== "string" || question.trim().length === 0) {
    return res.status(400).json({ error: "`question` must be a non-empty string." });
  }

  if (question.length > config.maxQuestionLength) {
    return res.status(400).json({
      error: `Question must be at most ${config.maxQuestionLength} characters.`,
    });
  }

  // Optional prior turns; the service sanitizes and caps them.
  const priorTurns = Array.isArray(history) ? history : [];

  // 1-based ordinal of this question in the session (clamped to a sane range),
  // so the agent can honestly say how many questions are left.
  const used = Number.isFinite(questionsUsed)
    ? Math.min(Math.max(Math.trunc(questionsUsed), 0), 1000)
    : 0;

  try {
    const result = await ask(question.trim(), priorTurns, Boolean(warned), used);
    return res.json(result);
  } catch (err) {
    console.error("Error handling /api/ask:", err);
    return res.status(500).json({ error: "Something went wrong answering the question." });
  }
}
