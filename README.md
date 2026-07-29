# DocAgent

Production-style **agentic document Q&A** for your AI portfolio:

- **LangGraph.js** — multi-step agent with tools and critique loop
- **Gemini** (free API) — chat + embeddings
- **Supabase pgvector** (free tier) — persistent vector search
- **Express + React** — API and demo UI with guardrails

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

## Project structure

```
server/   Express API, LangGraph agent, RAG, guardrails
web/      Vite + React demo UI
LEARNING.md   Study guide mapped to code
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health + Supabase ping |
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Upload PDF (`file` field) |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/chat` | `{ question, documentIds? }` |

## Free deployment

Full step-by-step guide: **[DEPLOY.md](DEPLOY.md)**

Quick overview:
1. Push repo to GitHub
2. **Render** — backend (`render.yaml` included)
3. **Vercel** — frontend (`vercel.json` included)
4. Set `VITE_API_URL` on Vercel → your Render API URL
5. Set `CORS_ORIGIN` on Render → your Vercel URL

## Portfolio pitch

> Built an agentic RAG system with LangGraph.js tool loops, Gemini embeddings, pgvector similarity search on Supabase, input/output guardrails, and a deployed React demo.

## Learn the codebase

Read **[LEARNING.md](LEARNING.md)** — concepts mapped to files with explanations.

## License

MIT
