# Ask Shahzaib — Agentic RAG

A small Retrieval-Augmented Generation app that answers questions about **Shahzaib Ali**
(full-stack developer) from a private corpus of his own documents.

Retrieval is *agentic*: a LangGraph agent decides whether a question even needs the
knowledge base, grades whether the retrieved context is sufficient, rewrites the query and
retries on a miss, and **declines rather than hallucinates** when the corpus has no answer.

- **Backend** — Node.js, Express, LangChain + LangGraph, Pinecone, OpenAI
- **Frontend** — React + Vite (no component library)

## Architecture

```
Question ─► route ─┬─(no retrieval)─────────────────────────► answer ─► END
                   │
                   └─(needs KB)─► retrieve ─► grade ─┬─(sufficient OR attempts≥2)─► answer ─► END
                                     ▲               │
                                     └── rewrite ◄───┘ (insufficient, retry once)
```

- `route` — greetings / small talk / generic tech questions skip retrieval entirely.
- `grade` — checks whether the top-5 chunks can actually answer the question.
- `rewrite` — reformulates the question with CV/project-style search terms and retries.
- The `attempts ≥ 2` guard is a hard stop so an unanswerable question can't loop forever.

## Prerequisites

- Node.js 18+ (tested on Node 22)
- An OpenAI API key
- A Pinecone account + API key

## 1. Create the Pinecone index

Create an index (via the Pinecone console or CLI) with:

- **Dimensions:** `1536` (matches `text-embedding-3-small`)
- **Metric:** `cosine`

Note its name — you'll set it as `PINECONE_INDEX`.

## 2. Configure environment

```bash
cd backend
cp .env.example .env
```

Fill in `backend/.env`:

```
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=ask-shahzaib
```

## 3. Add documents

Drop source files into `backend/documents/`. Supported: **`.md`, `.txt`, `.pdf`**
(e.g. your CV as a PDF and a self-describing Markdown file).

Filenames drive the `section` metadata:

| Filename contains | section      |
| ----------------- | ------------ |
| `cv`              | `experience` |
| `project`         | `projects`   |
| `skill`           | `skills`     |
| anything else     | `general`    |

## 4. Install & ingest

```bash
cd backend
npm install
npm run ingest
```

You should see: `Ingested N chunks from M files.`

Ingestion uses **deterministic IDs** (`md5(source)-chunkIndex`), so re-running it
overwrites existing chunks instead of creating duplicates. You can re-ingest at any time —
either with `npm run ingest` or by calling the endpoint:

```bash
curl -X POST http://localhost:3001/api/ingest
```

## 5. Run both servers

**Backend** (port 3001):

```bash
cd backend
npm run dev
```

**Frontend** (port 5173, proxies `/api` → backend):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## API

### `POST /api/ask`

```json
{ "question": "What has Shahzaib worked on?" }
```

Response:

```json
{
  "answer": "…",
  "sources": ["shahzaib-cv.pdf", "projects.md"],
  "retrievalUsed": true
}
```

- `400` if `question` is missing, empty, or longer than 2000 characters.
- `413` if the request body exceeds 16 kB.
- `429` if the rate limit is exceeded (20 requests / 15 min).
- `500` (generic message) on any internal error.

### `POST /api/ingest`

Re-runs ingestion over `backend/documents/`. Returns `{ "files": M, "chunks": N }`.

## Security

The API ships with sensible defaults for a small public-facing service:

- **Helmet** — secure HTTP response headers.
- **CORS allowlist** — only origins in `CORS_ORIGIN` (comma-separated) may call the API
  from a browser; defaults to `http://localhost:5173`. Set it to your deployed frontend
  origin in production.
- **Rate limiting** — 100 requests / 15 min across the API, plus a stricter
  20 requests / 15 min on `/api/ask` (it makes paid LLM calls). Returns `429` when
  exceeded. `trust proxy` is enabled so real client IPs are seen behind a reverse proxy.
- **Body-size cap** — JSON payloads over 16 kB are rejected (`413`).
- **Input-length cap** — questions over 2000 characters are rejected (`400`) before
  reaching the model.

All limits live in one place: `backend/src/config/index.js`.

## Deploy to Vercel

This is a monorepo, deployed as **two Vercel projects** from the same GitHub repo —
one for the frontend (static Vite build) and one for the backend (Express as a
serverless function). Push the repo to GitHub first.

### 1. Backend project

- **New Project** → import the repo → set **Root Directory** to `backend`.
- Vercel picks up `backend/vercel.json`, which routes all requests to the Express app
  in `backend/api/index.js` and allows up to a 60s function duration (the agent's
  retrieve → grade → rewrite loop can take a while).
- **Environment Variables:**
  - `OPENAI_API_KEY`
  - `PINECONE_API_KEY`
  - `PINECONE_INDEX`
  - `CORS_ORIGIN` — the frontend's URL (e.g. `https://ask-shahzaib.vercel.app`).
    You can add this after the frontend is deployed and its URL is known, then redeploy.
- Deploy, and note the backend URL (e.g. `https://ask-shahzaib-api.vercel.app`).

### 2. Frontend project

- **New Project** → import the **same** repo → set **Root Directory** to `frontend`
  (Vercel auto-detects Vite).
- **Environment Variable:**
  - `VITE_API_URL` — the backend URL from step 1 (e.g. `https://ask-shahzaib-api.vercel.app`).
- Deploy. Then set the backend's `CORS_ORIGIN` to this frontend URL and redeploy the backend.

### Notes on the serverless backend

- **Ingestion is local-only.** Your documents are gitignored, so they are not deployed.
  Run `npm run ingest` locally to populate Pinecone; the deployed backend only serves
  `/api/ask`. (The `/api/ingest` endpoint exists but has no documents in the cloud.)
- **Rate limiting is in-memory**, so on serverless it resets per cold start / instance —
  it's best-effort, not a hard guarantee. For strict limits, back it with a shared store
  (e.g. Upstash Redis).
- Contact details are cached per warm instance; a redeploy re-reads them from Pinecone.

## Notes

- Model: `gpt-4o-mini` (temperature 0.2); embeddings: `text-embedding-3-small`.
- ES modules throughout.
- `.env` and document contents are gitignored.
