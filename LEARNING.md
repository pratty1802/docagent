# DocAgent — Learning Guide

Study this repo layer by layer. Each section points to files with **why** comments in code.

## 1. Configuration

**File:** `server/src/config.ts`

- Zod validates env at boot — misconfigured deploys fail immediately.
- Tunable guardrail knobs: `MAX_AGENT_ITERATIONS`, `MIN_SIMILARITY_SCORE`, `HYBRID_ALPHA`, rate limits.

## 2. RAG pipeline

| Step | File | Concept |
|------|------|---------|
| PDF upload | `server/src/rag/ingest.ts` | Extract text, smarter page markers for citations |
| Chunking | `server/src/rag/chunker.ts` | Overlapping chunks improve retrieval |
| Query rewrite | `server/src/rag/rewrite.ts` | Vague questions → better search queries |
| Hybrid score | `server/src/rag/hybrid.ts` | Dense similarity + keyword overlap |
| Embeddings | `server/src/lib/embeddings.ts` | `gemini-embedding-001` at 768 dims |
| Storage | `server/src/rag/store.ts` | Supabase + `match_document_chunks` + re-rank |
| Schema | `server/src/db/schema.sql` | HNSW index, cosine similarity |

**Key idea:** Retrieval quality depends on chunk size, rewrite, hybrid scoring, and `MIN_SIMILARITY_SCORE`.

## 3. LangGraph agent

**Flow:** `input_guard` → `agent` ↔ `tools` → `critique` → (retry or END)

| File | Role |
|------|------|
| `server/src/agent/state.ts` | Shared state + reducers |
| `server/src/agent/graph.ts` | Nodes and conditional edges |
| `server/src/agent/nodes/inputGuard.ts` | Block bad input before LLM |
| `server/src/agent/nodes/agent.ts` | Gemini + tool binding |
| `server/src/agent/nodes/critique.ts` | Hybrid similarity + LLM groundedness |
| `server/src/agent/tools/index.ts` | Store-scoped tools only |
| `server/src/agent/run.ts` | `invoke` + `stream` runners |

**Key idea:** Graphs make control flow explicit — loops, caps, and branches are visible in code.

## 4. Streaming (SSE)

| File | Role |
|------|------|
| `server/src/routes/chat.ts` | `POST /api/chat/stream` |
| `server/src/agent/run.ts` | `runAgentStream` via `graph.stream({ streamMode: "updates" })` |
| `web/src/api.ts` | SSE line parser |
| `web/src/App.tsx` | Live typing + live trace |

**Events:** `trace` → `token` → `final` (or `error`). Heartbeats keep Render proxies awake.

## 5. Guardrails catalog

| Guardrail | File | Why |
|-----------|------|-----|
| Env validation | `config.ts` | Fail fast |
| Rate limits | `middleware/rateLimit.ts` | Protect free API quota |
| Request ID | `middleware/requestId.ts` | Log correlation |
| Safe errors | `middleware/errorHandler.ts` | No stack traces to clients |
| PDF magic bytes | `guardrails/upload.ts` | MIME spoofing defense |
| Prompt injection | `guardrails/input.ts` | Block before LLM call |
| System prompt | `guardrails/prompts.ts` | Document-only answers |
| Iteration caps | `agent/graph.ts` | Prevent runaway loops |
| Groundedness | `agent/nodes/critique.ts` | Reduce hallucinations |
| Answer length | `guardrails/output.ts` | Cap response size |
| Service role only | `lib/supabase.ts` | DB key never in React |

## 6. Express API

**Files:** `server/src/app.ts`, `server/src/routes/*`

Middleware order: requestId → logging → helmet → cors → routes → errorHandler.

## 7. Frontend

**Files:** `web/src/App.tsx`, `web/src/api.ts`

- Streaming chat with AbortController
- Starter questions + cold-start banner for Render sleep
- Guardrail refusals shown with distinct styling

## 8. Evals

```bash
npm run eval
```

| File | Role |
|------|------|
| `server/evals/fixtures.json` | Questions + expectations |
| `server/evals/run.ts` | Retrieval / citation / keyword checks |

Upload docs that match your fixtures before scoring.

## 9. Experiments to try

1. Lower `MIN_SIMILARITY_SCORE` — more recall, noisier citations.
2. Change `HYBRID_ALPHA` (1 = pure vector, 0 = pure keywords).
3. Raise `MAX_CRITIQUE_RETRIES` — more self-correction, higher latency/cost.
4. Ask a jailbreak prompt — watch `input_guard` block without calling Gemini.
5. Watch the agent trace stream live while the answer types out.

## 10. Stretch goals

- LangSmith traces
- Multi-turn memory / auth + RLS
- DOCX/TXT ingest
- True token-level LLM streaming inside tool loops
