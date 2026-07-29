# DocAgent — Learning Guide

Study this repo layer by layer. Each section points to files with **why** comments in code.

## 1. Configuration

**File:** `server/src/config.ts`

- Zod validates env at boot — misconfigured deploys fail immediately.
- Tunable guardrail knobs: `MAX_AGENT_ITERATIONS`, `MIN_SIMILARITY_SCORE`, rate limits.

## 2. RAG pipeline

| Step | File | Concept |
|------|------|---------|
| PDF upload | `server/src/rag/ingest.ts` | Extract text, page markers for citations |
| Chunking | `server/src/rag/chunker.ts` | Overlapping chunks improve retrieval |
| Embeddings | `server/src/lib/embeddings.ts` | `gemini-embedding-001` at 768 dims (not `text-embedding-004` on free API) |
| Storage | `server/src/rag/store.ts` | Supabase + `match_document_chunks` RPC |
| Schema | `server/src/db/schema.sql` | HNSW index, cosine similarity |

**Key idea:** Retrieval quality depends on chunk size, overlap, and similarity threshold (`MIN_SIMILARITY_SCORE`).

## 3. LangGraph agent

**Flow:** `input_guard` → `agent` ↔ `tools` → `critique` → (retry or END)

| File | Role |
|------|------|
| `server/src/agent/state.ts` | Shared state + reducers |
| `server/src/agent/graph.ts` | Nodes and conditional edges |
| `server/src/agent/nodes/inputGuard.ts` | Block bad input before LLM |
| `server/src/agent/nodes/agent.ts` | Gemini + tool binding |
| `server/src/agent/nodes/critique.ts` | Groundedness grading |
| `server/src/agent/tools/index.ts` | Store-scoped tools only |
| `server/src/agent/run.ts` | Invoke graph from API |

**Key idea:** Graphs make control flow explicit — loops, caps, and branches are visible in code.

## 4. Guardrails catalog

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

## 5. Express API

**Files:** `server/src/app.ts`, `server/src/routes/*`

Middleware order: requestId → logging → helmet → cors → routes → errorHandler.

## 6. Frontend

**Files:** `web/src/App.tsx`, `web/src/api.ts`

- Client validation is UX-only; server enforces guardrails.
- Guardrail refusals shown with distinct styling.

## 7. Experiments to try

1. Lower `MIN_SIMILARITY_SCORE` — more recall, noisier citations.
2. Raise `MAX_CRITIQUE_RETRIES` — more self-correction, higher latency/cost.
3. Ask a jailbreak prompt — watch `input_guard` block without calling Gemini.
4. Ask about topics not in your PDF — critique should refuse or mark ungrounded.

## 8. Stretch goals (not in v1)

- SSE streaming for answers
- LangSmith traces
- Eval dataset for faithfulness scores
- User auth + RLS on Supabase
