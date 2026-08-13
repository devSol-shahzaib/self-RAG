# Ask Shahzaib — Agentic RAG Chat

A small but complete **Retrieval-Augmented Generation** app that answers questions about
**Shahzaib Ali** (full-stack developer) in his own voice, grounded in a private corpus of
his documents (CV + personal notes).

It isn't a plain "stuff the docs into a prompt" RAG. A **LangGraph agent** decides whether a
question even needs the knowledge base, judges whether what it retrieved is good enough,
rewrites the query and retries on a miss, and answers **as Shahzaib, in the first person** —
declining (playfully) rather than hallucinating when the corpus has no answer.

> **Stack:** Node.js · Express · LangChain + LangGraph · Pinecone · OpenAI (`gpt-4o-mini`,
> `text-embedding-3-small`) · React + Vite

---

## ✨ Features

- **Agentic retrieval** — route → retrieve → grade → rewrite → answer, with a hard retry cap.
- **Speaks as Shahzaib** — first person, warm and casual, plain punctuation (no em dashes).
- **Knows when to skip the KB** — greetings and small talk answer instantly, no vector search.
- **Playful, varied declines** — out-of-scope questions get a different cheeky one-liner each
  time (with a 😛), never a made-up answer.
- **Conversation memory** — follow-ups like "no" or "tell me more" are understood in context.
- **Privacy-aware contact handling** — shares email + LinkedIn (read from the CV), never the
  phone number.
- **Polished chat UI** — avatar, suggestion chips, typing indicator, reset button, and a
  10-message-per-session limit with a friendly sign-off.
- **Hardened API** — Helmet, CORS allowlist, rate limiting, body-size and input-length caps.

---

## 🧠 How the agent works

```
Question ─► route ─┬─(greeting / small talk)──────────────────────────► generate ─► END
                   │
                   └─(question about Shahzaib)─► retrieve ─► grade ─┬─(good enough OR
                                                    ▲               │   attempts ≥ 2)─► generate ─► END
                                                    └── rewrite ◄────┘  (insufficient, retry)
```

| Node | Job |
| ---- | --- |
| `route` | Decide if the question needs the knowledge base. Greetings/small talk skip it. |
| `retrieve` | Similarity search against Pinecone (top 5). |
| `grade` | Judge whether the retrieved chunks can actually answer the question. |
| `rewrite` | Reformulate the query with CV/personal-note style terms and retry. |
| `generate` | Answer as Shahzaib — one of: **answer** from context, **chat** (greeting), or **tease** (no answer available). |

The `attempts ≥ 2` guard is a hard stop so an unanswerable question can never loop forever.

---

## 📁 Project structure

```
self-rag/
├── backend/                  # Express API + LangGraph agent
│   ├── src/
│   │   ├── config/           # env + all tunables (models, limits, chunking)
│   │   ├── models/           # data access: Pinecone store + document loader
│   │   ├── services/         # business logic: ingestion + the RAG agent
│   │   ├── controllers/      # thin HTTP handlers
│   │   ├── routes/           # /api routing
│   │   ├── app.js            # Express app (middleware + routes)
│   │   ├── server.js         # local entry point (listen)
│   │   └── ingest.js         # CLI: load, chunk, embed, upsert
│   ├── api/index.js          # Vercel serverless entry (exports the Express app)
│   ├── documents/            # your .md / .txt / .pdf sources (gitignored)
│   └── vercel.json
└── frontend/                 # React + Vite single-page chat
    ├── src/App.jsx
    ├── src/styles.css
    └── public/avatar.png     # your headshot (optional)
```

---

## 🚀 Getting started

### Prerequisites

- Node.js 18+ (tested on Node 22)
- An OpenAI API key
- A Pinecone account + API key

### 1. Create the Pinecone index

Create an index with:

- **Dimensions:** `1536` (matches `text-embedding-3-small`)
- **Metric:** `cosine`

Note its name for `PINECONE_INDEX`.

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Fill in `backend/.env`:

```
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=ask-shahzaib
CORS_ORIGIN=http://localhost:5173
```

### 3. Add your documents

Drop source files into `backend/documents/`. Supported: **`.md`, `.txt`, `.pdf`**
(e.g. your CV as a PDF and a self-describing Markdown file). The filename sets a `section`
tag on each chunk:

| Filename contains | section      |
| ----------------- | ------------ |
| `cv`              | `experience` |
| `project`         | `projects`   |
| `skill`           | `skills`     |
| anything else     | `general`    |

### 4. Install & ingest

```bash
cd backend
npm install
npm run ingest        # -> "Ingested N chunks from M files."
```

Ingestion uses **deterministic IDs** (`md5(source)-chunkIndex`), so re-running it overwrites
existing chunks instead of duplicating. Re-ingest any time with `npm run ingest` or
`curl -X POST http://localhost:3001/api/ingest`.

### 5. Run both servers

```bash
# terminal 1 — backend on :3001
cd backend && npm run dev

# terminal 2 — frontend on :5173 (proxies /api -> :3001)
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**. Drop your headshot at `frontend/public/avatar.png` to
personalize it (a friendly emoji shows until you do).

---

## 🔌 API

### `POST /api/ask`

```json
{
  "question": "What are your strongest skills?",
  "history": [
    { "role": "user", "text": "hi" },
    { "role": "assistant", "text": "Hey there! ..." }
  ]
}
```

`history` is optional (prior turns, for context). Response:

```json
{ "answer": "…", "sources": ["Shahzaib_Ali_CV.pdf"], "retrievalUsed": true }
```

Errors: `400` (missing/empty/>2000-char question) · `413` (body > 16 kB) ·
`429` (rate limited) · `500` (generic).

### `POST /api/ingest`

Re-runs ingestion over `backend/documents/`. Returns `{ "files": M, "chunks": N }`.

---

## 🎭 Persona & behavior

All of this lives in the `generate` node's prompt in `backend/src/services/ragService.js`:

- **Voice** — first person, warm, casual, concise (1–3 sentences); plain punctuation only
  (a sanitizer strips em dashes as a safety net, keeping date ranges intact).
- **Greetings** — friendly, and invites you with *"let me know what you want to know about me"*.
- **Unknown questions** — a short, playful refusal that varies every time (pulled from a
  rotating hint pool) and always ends on a 😛.
- **Contact info** — email + LinkedIn are extracted once from the knowledge base and cached;
  the phone number is deliberately never shared.

---

## 🔒 Security

- **Helmet** — secure HTTP response headers.
- **CORS allowlist** — only origins in `CORS_ORIGIN` (comma-separated) may call the API.
- **Rate limiting** — 100 req / 15 min across the API, plus a stricter 20 req / 15 min on
  `/api/ask` (it makes paid LLM calls). `trust proxy` is on for correct client IPs.
- **Body-size cap** — JSON over 16 kB is rejected (`413`).
- **Input-length cap** — questions over 2000 characters are rejected (`400`).

All limits live in one place: `backend/src/config/index.js`.

---

## ☁️ Deploy to Vercel

This monorepo deploys as **two Vercel projects** from the same GitHub repo. Push to GitHub
first.

**1. Backend project** — import the repo, set **Root Directory** to `backend`. Vercel uses
`backend/vercel.json` (routes everything to the Express app in `backend/api/index.js`, 60s
max duration). Env vars: `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`,
`CORS_ORIGIN` (the frontend URL). Note the deployed backend URL.

**2. Frontend project** — import the **same** repo, set **Root Directory** to `frontend`
(Vercel auto-detects Vite). Env var: `VITE_API_URL` = the backend URL. Deploy, then set the
backend's `CORS_ORIGIN` to the frontend URL and redeploy the backend.

**Serverless notes**
- **Ingestion is local-only** — your documents are gitignored, so run `npm run ingest`
  locally to populate Pinecone. The cloud backend only serves `/api/ask`.
- **Rate limiting is in-memory** — resets per cold start on serverless (best-effort). Back it
  with a shared store (e.g. Upstash Redis) for hard limits.
- Contact details are cached per warm instance; a redeploy re-reads them from Pinecone.

---

## ⚙️ Handy knobs

| Want to change… | Where |
| --------------- | ----- |
| Model, temperature, chunk size, top-K, rate limits | `backend/src/config/index.js` |
| Persona, greeting, tease wording/variations | `backend/src/services/ragService.js` |
| Messages-per-session limit and sign-off text | `MESSAGE_LIMIT` / `SIGN_OFF` in `frontend/src/App.jsx` |
| Theme / colors | `frontend/src/styles.css` (CSS variables at the top) |

---

## Notes

- ES modules throughout.
- `.env` and everything under `backend/documents/` are gitignored — your keys and personal
  docs never leave your machine (or your own Vercel project).
