import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { config } from "../config/index.js";
import { getVectorStore } from "../models/pineconeStore.js";

/**
 * RAG business logic: an agentic LangGraph pipeline that routes, retrieves,
 * grades, rewrites, and answers — plus a thin ask() the controller calls.
 */

const llm = new ChatOpenAI({
  model: config.chatModel,
  temperature: config.chatTemperature,
});

/** Shared graph state. */
const State = Annotation.Root({
  question: Annotation(),
  query: Annotation(),
  history: Annotation({ default: () => [], reducer: (_, next) => next }),
  documents: Annotation({ default: () => [], reducer: (_, next) => next }),
  answer: Annotation(),
  attempts: Annotation({ default: () => 0, reducer: (_, next) => next }),
  needsRetrieval: Annotation(),
  sufficient: Annotation(),
});

/** Format retrieved documents into a single context block for the LLM. */
function formatContext(documents) {
  if (!documents || documents.length === 0) return "";
  return documents
    .map((doc, i) => `[${i + 1}] (${doc.metadata?.source ?? "unknown"})\n${doc.pageContent}`)
    .join("\n\n");
}

/** Convert chat history into LLM messages (last few turns, sanitized). */
function toChatMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "assistant")
    )
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.text }));
}

// --- Nodes -----------------------------------------------------------------

/** Decide whether the question needs the knowledge base. Seeds `query`. */
async function route(state) {
  const router = llm.withStructuredOutput(
    z.object({ needsRetrieval: z.boolean(), reason: z.string() }),
    { name: "route" }
  );

  const { needsRetrieval } = await router.invoke([
    {
      role: "system",
      content:
        "You route messages for a personal Q&A chat where visitors ask Shahzaib Ali about himself. " +
        "Use the conversation so far to interpret short or referential replies (e.g. 'yes', 'no', " +
        "'tell me more', 'why?'). " +
        "Set needsRetrieval=true for ANY question that asks for information about Shahzaib — his work AND " +
        "his personal life: experience, projects, skills, background, education, location, and " +
        "hobbies/interests such as cooking, cricket, gardening, fitness, and anything else about him. " +
        "Set needsRetrieval=false for pure greetings, thanks, or small talk (e.g. 'hi', 'how are you', " +
        "'thanks'), for short conversational replies that are not themselves a lookup question " +
        "(e.g. 'no', 'yeah', 'cool', 'ok'), and for generic questions that are not about Shahzaib. " +
        "When it IS a question about him, prefer retrieval (true).",
    },
    ...toChatMessages(state.history),
    { role: "user", content: state.question },
  ]);

  return { needsRetrieval, query: state.question };
}

/** Similarity search against Pinecone (top K). Counts an attempt. */
async function retrieve(state) {
  const store = await getVectorStore();
  const documents = await store.similaritySearch(state.query, config.retrievalTopK);
  return { documents, attempts: state.attempts + 1 };
}

/** Judge whether the retrieved context can actually answer the question. */
async function grade(state) {
  const grader = llm.withStructuredOutput(
    z.object({ sufficient: z.boolean() }),
    { name: "grade" }
  );

  const { sufficient } = await grader.invoke([
    {
      role: "system",
      content:
        "You judge whether the provided context is sufficient to answer the question about Shahzaib Ali — " +
        "covering his work or his personal life (hobbies, cooking, cricket, gardening, background, etc.). " +
        "Answer sufficient=true only if the context actually contains the information needed.",
    },
    {
      role: "user",
      content: `Question: ${state.question}\n\nContext:\n${formatContext(state.documents)}`,
    },
  ]);

  return { sufficient };
}

/** Rewrite the question into a CV/project-style search query. */
async function rewrite(state) {
  const res = await llm.invoke([
    {
      role: "system",
      content:
        "Rewrite the user's latest message into a concise, standalone search query using concrete terms " +
        "likely to appear in Shahzaib's profile notes. Resolve any references to the conversation so far " +
        "(e.g. 'tell me more', 'what about that?') into an explicit query. Terms may be about his work " +
        "(job titles, technologies, company or project names, skills) OR his personal life (specific " +
        "dishes, sports, hobbies, places). Return only the rewritten query, nothing else.",
    },
    ...toChatMessages(state.history),
    { role: "user", content: state.question },
  ]);

  const query = res.content.toString().trim();
  return { query: query || state.question };
}

// Contact info is extracted from the knowledge base (e.g. the CV) once and
// cached, so the values are always the real ones and never fabricated. The
// phone number is deliberately never extracted or shared.
let cachedContact;
async function getContactInfo() {
  if (cachedContact) return cachedContact;
  try {
    const store = await getVectorStore();
    const docs = await store.similaritySearch(
      "Shahzaib Ali contact email LinkedIn phone",
      5
    );
    const text = docs.map((d) => d.pageContent).join("\n");
    const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || "";
    const linkedinRaw = (text.match(/linkedin\.com\/in\/[\w-]+/i) || [])[0] || "";
    cachedContact = { email, linkedin: linkedinRaw ? `https://${linkedinRaw}` : "" };
  } catch {
    cachedContact = { email: "", linkedin: "" };
  }
  return cachedContact;
}

/** Build the contact rule using real values extracted from the knowledge base. */
function contactRuleFor({ email, linkedin }) {
  const parts = [
    email && `email ${email}`,
    linkedin && `LinkedIn ${linkedin}`,
  ].filter(Boolean);

  const base =
    "Personal contact rule (important): NEVER share my phone, mobile, cell, or WhatsApp number, even if " +
    "it appears in the info below. ";

  if (parts.length === 0) {
    return (
      base +
      "If asked how to reach me, say I don't have contact details to share here; never invent an email or URL."
    );
  }

  return (
    base +
    "If someone asks for my number, politely decline and share my email and LinkedIn instead. When " +
    "giving contact details, use EXACTLY these values and never invent or use placeholder addresses: " +
    `${parts.join(", ")}. Share these freely when asked how to reach or contact me. This is an ANSWER ` +
    "(not a tease)."
  );
}

// Playful one-line refusals for questions with no answer in the knowledge base.
// A random few are shown to the model each turn so the wording keeps changing.
const TEASE_HINTS = [
  "haha that one's a bit too personal, I'll keep it to myself 😛",
  "nice try, some things stay off the record 😛",
  "ha, you're digging deep now, that one stays a secret 😛",
  "lol I'm not spilling that one 😛",
  "hmm, that's for me to know 😛",
  "you're getting a little nosy now, I'll pass on that one 😛",
  "ha, I can't give away all my secrets 😛",
  "that one's staying in the vault 😛",
  "cheeky, but I'll dodge that one 😛",
];

/** A few random tease examples, joined, to nudge fresh wording each turn. */
function sampleTeaseHints(n = 3) {
  return [...TEASE_HINTS]
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
    .join(" / ");
}

/**
 * Keep replies plain and human: drop em dashes and spaced hyphens used as
 * dashes (replacing with commas), but leave en dashes so ranges like 2014–2018
 * stay intact. Tidies up the spacing/commas that result.
 */
function humanizeText(s) {
  return s
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ", ")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/😛\s*[.!]+/g, "😛") // drop the awkward full stop after the tease emoji
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Generate the final reply as Shahzaib, choosing exactly one behavior. */
async function generate(state) {
  const context = formatContext(state.documents);
  const contact = await getContactInfo();

  const res = await llm.invoke([
    {
      role: "system",
      content:
        "You are Shahzaib Ali, a full-stack developer, chatting directly with someone about yourself. " +
        "Speak in the first person (I, me, my). Talk like a real person in a casual chat: warm, relaxed, " +
        "and natural, using everyday words and normal contractions. Use the conversation so far so " +
        "follow-ups and short replies make sense. Never mention documents, sources, files, or context, " +
        "just talk naturally.\n" +
        "Keep punctuation plain and simple: use periods and commas only. Do NOT use em dashes, en dashes, " +
        "semicolons, colons for effect, ellipses, or exclamation marks, and do NOT use markdown or bullet " +
        "points.\n" +
        "Keep every reply short and to the point, answering only what was asked, usually one to three " +
        "short sentences. For a list question like skills, give a short comma separated list inside a " +
        "normal sentence. Do not add background they did not ask for, do not repeat yourself, and do not " +
        "end with a sales-pitch style follow up like 'let me know if you want to know more'.\n\n" +
        contactRuleFor(contact) +
        "\n\n" +
        "Choose EXACTLY ONE of these behaviors for your reply:\n" +
        "1) ANSWER, if info about me is provided below and it addresses their message, answer it concisely " +
        "and specifically. Do NOT invent anything beyond it, and do NOT add any teasing line.\n" +
        "2) CHAT, if they are only greeting, thanking, or replying conversationally (like 'hi', 'thanks', " +
        "'no', 'cool') with no real question to look up, reply warmly. When it fits, invite them with " +
        "something like 'let me know what you want to know about me' (never 'how can I assist you'). " +
        "Do NOT tease.\n" +
        "3) TEASE, only if they asked a real question about me and no info to answer it is provided below, " +
        "do NOT answer and do NOT guess. Reply with only a short, playful one line refusal in your own " +
        "words, and word it differently every single time so it never sounds like a canned line. Always " +
        "include a 😛. Keep it friendly and plain. For a sense of the vibe (do not copy these word for " +
        "word, write a fresh one): " +
        sampleTeaseHints() +
        ".\n\n" +
        "Never combine an answer with a tease. If you can answer from the info provided, just answer.",
    },
    ...toChatMessages(state.history),
    {
      role: "user",
      content: context
        ? `(Info I can use to answer, about me:\n${context}\n)\n\n${state.question}`
        : state.question,
    },
  ]);

  return { answer: humanizeText(res.content.toString().trim()) };
}

// --- Edges -----------------------------------------------------------------

const afterRoute = (state) => (state.needsRetrieval ? "retrieve" : "generate");

// Hard guard: stop after maxAttempts so unanswerable questions can't loop.
const afterGrade = (state) =>
  state.sufficient || state.attempts >= config.maxAttempts ? "generate" : "rewrite";

// Node id is "generate" (LangGraph forbids a node name that collides with the
// "answer" state channel); it still produces the final answer.
const graph = new StateGraph(State)
  .addNode("route", route)
  .addNode("retrieve", retrieve)
  .addNode("grade", grade)
  .addNode("rewrite", rewrite)
  .addNode("generate", generate)
  .addEdge(START, "route")
  .addConditionalEdges("route", afterRoute, ["retrieve", "generate"])
  .addEdge("retrieve", "grade")
  .addConditionalEdges("grade", afterGrade, ["rewrite", "generate"])
  .addEdge("rewrite", "retrieve")
  .addEdge("generate", END)
  .compile();

/**
 * Answer a question through the agent, shaping the API response.
 *
 * @param {string} question
 * @param {Array<{ role: "user" | "assistant", text: string }>} [history] prior turns
 * @returns {Promise<{ answer: string, sources: string[], retrievalUsed: boolean }>}
 */
export async function ask(question, history = []) {
  const result = await graph.invoke({ question, history });

  const sources = [
    ...new Set((result.documents ?? []).map((doc) => doc.metadata?.source).filter(Boolean)),
  ];

  return {
    answer: result.answer ?? "",
    sources,
    retrievalUsed: Boolean(result.needsRetrieval),
  };
}
