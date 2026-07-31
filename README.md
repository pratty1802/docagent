# DocAgent

**Agentic document Q&A** — upload PDFs, ask questions, get grounded answers with citations.

- **LangGraph.js** — multi-step agent with tools and critique loop
- **Gemini** (free API) — chat + embeddings
- **Supabase pgvector** (free tier) — persistent vector search
- **SSE streaming** — live answer tokens + agent trace
- **Hybrid RAG** — vector search + keyword boost + query rewrite
- **Evals** — `npm run eval` regression checks
- **Express + React** — API and demo UI with guardrails

## Live

| | URL |
|--|--|
| **Demo** | https://docagent-web.vercel.app |
| **API** | https://docagent-lr7s.onrender.com |
| **Health** | https://docagent-lr7s.onrender.com/api/health |
| **Repo** | https://github.com/pratty1802/docagent |

## Quick start

### 1. Prerequisites

- Node.js 20+
- Free [Gemini API key](https://aistudio.google.com/apikey)
- Free [Supabase project](https://supabase.com)

### 2. Supabase setup

1. Create a project in Supabase.
2. **Enable pgvector:** Dashboard → **Database** → **Extensions** → search `vector` → **Enable**.
3. Open **SQL Editor**, run [`server/src/db/schema.sql`](server/src/db/schema.sql) (tables + search function only).
4. Copy **Project URL** and **service_role** key (Settings → API).

### 3. Environment

```bash
cp .env.example .env
# Fill in GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

### 4. Install & run

```bash
npm install
npm run dev:server
```

Server runs at http://localhost:8787 — test with http://localhost:8787/api/health

In a **second terminal**:

```bash
npm run dev:web
```

Open http://localhost:5173

### 5. Evals (optional)

Upload a PDF first, then:

```bash
npm run eval
```

## Project structure

```
server/   Express API, LangGraph agent, RAG, guardrails, evals/
web/      Vite + React demo UI (SSE streaming)
LEARNING.md   Study guide mapped to code
DEPLOY.md     Free hosting walkthrough
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health + Supabase ping |
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Upload PDF (`file` field) |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/chat` | `{ question, documentIds? }` → full JSON |
| POST | `/api/chat/stream` | Same body → **SSE** (`trace` / `token` / `final` / `error`) |

## Free deployment

Full step-by-step guide: **[DEPLOY.md](DEPLOY.md)**

Quick overview:
1. Push repo to GitHub
2. **Render** — backend (`render.yaml` included)
3. **Vercel** — frontend (`web/vercel.json`, Root Directory = `web`)
4. Set `VITE_API_URL` on Vercel → your Render API URL
5. Set `CORS_ORIGIN` on Render → your Vercel URL

## Learn the codebase

Read **[LEARNING.md](LEARNING.md)** — concepts mapped to files with explanations.

## License

MIT
