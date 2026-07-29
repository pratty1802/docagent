import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkHealth,
  deleteDocument,
  fetchDocuments,
  streamChat,
  uploadDocument,
} from "./api";
import type { AgentTraceStep, ChatMessage, DocumentMeta } from "./types";
import "./App.css";

const STARTER_QUESTIONS = [
  "What is this document about?",
  "Summarize the key points",
  "List any important dates or numbers",
];

export default function App() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [trace, setTrace] = useState<AgentTraceStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiWarming, setApiWarming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    let cancelled = false;
    const warm = async () => {
      setApiWarming(true);
      try {
        await checkHealth();
      } catch {
        // cold start / offline — banner stays until next successful call
      } finally {
        if (!cancelled) setApiWarming(false);
      }
    };
    warm();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const toggleDocument = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(file);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteDocument(id);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const askQuestion = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;
    if (trimmed.length > 2000) {
      setError("Question must be under 2000 characters.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setQuestion("");
    setTrace([]);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", streaming: true },
    ]);

    const scope = selectedIds.length > 0 ? selectedIds : undefined;

    try {
      await streamChat(
        trimmed,
        scope,
        {
          onTrace: (step) => {
            setTrace((prev) =>
              prev.some((s) => s.id === step.id) ? prev : [...prev, step],
            );
          },
          onToken: (text, replace) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last || last.role !== "assistant") return prev;
              next[next.length - 1] = {
                ...last,
                content: replace ? text : last.content + text,
                streaming: true,
              };
              return next;
            });
          },
          onFinal: (result) => {
            setTrace(result.trace);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last || last.role !== "assistant") return prev;
              next[next.length - 1] = {
                role: "assistant",
                content: result.answer,
                blocked: result.blocked,
                citations: result.citations,
                grade: result.grade,
                streaming: false,
              };
              return next;
            });
          },
          onError: (msg) => {
            setError(msg);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant" && last.streaming && !last.content) {
                next.pop();
              } else if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, streaming: false };
              }
              return next;
            });
          },
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Chat failed");
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.streaming && !last.content) {
            next.pop();
          }
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = () => askQuestion(question);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>DocAgent</h1>
          <p className="subtitle">
            Agentic RAG with LangGraph · Gemini · Supabase pgvector · live SSE
          </p>
        </div>
        <span className="badge">Portfolio Demo</span>
      </header>

      {apiWarming && (
        <div className="alert info">
          Waking API (Render free tier may take ~30–60s on first request)…
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <div className="layout">
        <aside className="sidebar">
          <section className="card">
            <h2>Documents</h2>
            <label className="upload-zone">
              <input
                type="file"
                accept="application/pdf"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <span>{uploading ? "Uploading…" : "Drop PDF or click to upload"}</span>
            </label>
            <p className="muted small tip">
              Tip: upload a text PDF (not scanned images), then try a starter question.
            </p>

            <ul className="doc-list">
              {documents.length === 0 && (
                <li className="muted">No documents yet</li>
              )}
              {documents.map((doc) => (
                <li key={doc.id} className="doc-item">
                  <label className="doc-row">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(doc.id)}
                      onChange={() => toggleDocument(doc.id)}
                    />
                    <div>
                      <strong>{doc.filename}</strong>
                      <span className="muted">
                        {doc.pageCount} pages · {doc.chunkCount} chunks
                      </span>
                    </div>
                  </label>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => handleDelete(doc.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            {selectedIds.length > 0 && (
              <p className="muted small">
                Searching {selectedIds.length} selected document(s)
              </p>
            )}
          </section>

          <section className="card trace-card">
            <h2>Agent trace</h2>
            {trace.length === 0 ? (
              <p className="muted">
                {loading ? "Waiting for first node…" : "Trace appears live as the agent runs"}
              </p>
            ) : (
              <ol className="trace-list">
                {trace.map((step) => (
                  <li key={step.id}>
                    <span className="trace-node">{step.node}</span>
                    <span className="muted">{step.detail}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>

        <main className="chat card">
          <h2>Chat</h2>
          <div className="messages">
            {messages.length === 0 && (
              <div className="empty-chat">
                <p className="muted">
                  Upload a PDF and ask questions grounded in your documents.
                  Answers stream live with citations.
                </p>
                <div className="starters">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="starter-btn"
                      disabled={loading || documents.length === 0}
                      onClick={() => askQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`message ${msg.role}${msg.blocked ? " blocked" : ""}${msg.streaming ? " streaming" : ""}`}
              >
                <div className="message-meta">{msg.role}</div>
                <p>
                  {msg.content}
                  {msg.streaming && <span className="cursor" aria-hidden="true" />}
                </p>
                {msg.blocked && (
                  <span className="guardrail-tag">Guardrail</span>
                )}
                {msg.grade && (
                  <p className="grade">
                    Grounded: {msg.grade.grounded ? "yes" : "no"} (
                    {msg.grade.score.toFixed(2)}) — {msg.grade.rationale}
                  </p>
                )}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="citations">
                    <strong>Sources</strong>
                    {msg.citations.map((c) => (
                      <blockquote key={c.chunkId}>
                        <span>
                          {c.filename} · page {c.page} · score {c.score.toFixed(3)}
                        </span>
                        <p>{c.excerpt}</p>
                      </blockquote>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="chat-input">
            <textarea
              value={question}
              placeholder="Ask about your documents…"
              rows={3}
              disabled={loading}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
            />
            <button type="button" disabled={loading || !question.trim()} onClick={handleAsk}>
              {loading ? "Streaming…" : "Ask"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
