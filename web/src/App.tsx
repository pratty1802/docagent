import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  checkHealth,
  deleteDocument,
  fetchDocuments,
  streamChat,
  uploadDocument,
} from "./api";
import { normalizeAssistantMarkdown } from "./lib/markdown";
import type {
  AgentTraceStep,
  ChatMessage,
  Citation,
  DocumentMeta,
  GroundednessGrade,
} from "./types";
import "./App.css";

const STARTER_QUESTIONS = [
  "What is this document about?",
  "Summarize the key points",
  "List any important dates or numbers",
];

function shortName(filename: string) {
  if (filename.length <= 28) return filename;
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf("."))
    : "";
  return `${filename.slice(0, 22)}…${ext}`;
}

function CitationList({ citations }: { citations: Citation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? citations : citations.slice(0, 3);

  return (
    <div className="citations">
      <div className="citations-head">
        <span className="citations-label">Sources</span>
        <span className="citations-count">{citations.length}</span>
      </div>
      <ul className="citation-list">
        {visible.map((c) => {
          const open = openId === c.chunkId;
          return (
            <li key={c.chunkId} className={`citation-item${open ? " open" : ""}`}>
              <button
                type="button"
                className="citation-chip"
                onClick={() => setOpenId(open ? null : c.chunkId)}
                aria-expanded={open}
              >
                <span className="citation-file" title={c.filename}>
                  {shortName(c.filename)}
                </span>
                <span className="citation-meta">
                  p.{c.page}
                  <span className="dot">·</span>
                  {c.score.toFixed(2)}
                </span>
                <span className="citation-chevron" aria-hidden>
                  {open ? "−" : "+"}
                </span>
              </button>
              {open && (
                <p className="citation-excerpt">
                  {c.excerpt.length > 180
                    ? `${c.excerpt.slice(0, 180).trim()}…`
                    : c.excerpt}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {citations.length > 3 && (
        <button
          type="button"
          className="text-btn"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show fewer" : `Show ${citations.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function GradePill({ grade }: { grade: GroundednessGrade }) {
  const pct = Math.round(grade.score * 100);
  return (
    <div
      className={`grade-pill ${grade.grounded ? "ok" : "warn"}`}
      title={grade.rationale}
    >
      <span className="grade-dot" />
      {grade.grounded ? "Grounded" : "Weak grounding"}
      <span className="grade-score">{pct}%</span>
    </div>
  );
}

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
  const [traceOpen, setTraceOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
        // cold start / offline
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (loading || trace.length > 0) setTraceOpen(true);
  }, [loading, trace.length]);

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
    setTraceOpen(true);
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
      <div className="bg-mesh" aria-hidden />

      <header className="header">
        <div className="brand">
          <p className="brand-mark">DocAgent</p>
          <p className="brand-tag">Document Q&A with grounded citations</p>
        </div>
        <div className="header-meta">
          <span className="pill">LangGraph · Gemini · pgvector</span>
        </div>
      </header>

      {apiWarming && (
        <div className="banner info" role="status">
          Waking API — first request on free hosting can take 30–60s.
        </div>
      )}

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <div className="shell">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-head">
              <h2>Library</h2>
              {documents.length > 0 && (
                <span className="count-badge">{documents.length}</span>
              )}
            </div>

            <label className={`upload-zone${uploading ? " busy" : ""}`}>
              <input
                type="file"
                accept="application/pdf"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <span className="upload-title">
                {uploading ? "Uploading…" : "Upload PDF"}
              </span>
              <span className="upload-hint">Text PDFs work best</span>
            </label>

            <ul className="doc-list">
              {documents.length === 0 && (
                <li className="empty-hint">No documents yet</li>
              )}
              {documents.map((doc) => {
                const selected = selectedIds.includes(doc.id);
                return (
                  <li
                    key={doc.id}
                    className={`doc-item${selected ? " selected" : ""}`}
                  >
                    <label className="doc-row">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleDocument(doc.id)}
                      />
                      <div className="doc-info">
                        <strong title={doc.filename}>
                          {shortName(doc.filename)}
                        </strong>
                        <span>
                          {doc.pageCount}p · {doc.chunkCount} chunks
                        </span>
                      </div>
                    </label>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`Delete ${doc.filename}`}
                      onClick={() => handleDelete(doc.id)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedIds.length > 0 && (
              <p className="scope-note">
                Scoped to {selectedIds.length} doc
                {selectedIds.length === 1 ? "" : "s"}
              </p>
            )}
          </section>

          <section className="panel trace-panel">
            <button
              type="button"
              className="panel-toggle"
              onClick={() => setTraceOpen((v) => !v)}
              aria-expanded={traceOpen}
            >
              <h2>Agent trace</h2>
              <span className="toggle-meta">
                {loading ? "live" : `${trace.length}`}
                <span className="chevron">{traceOpen ? "▾" : "▸"}</span>
              </span>
            </button>
            {traceOpen && (
              <div className="trace-body">
                {trace.length === 0 ? (
                  <p className="empty-hint">
                    {loading
                      ? "Waiting for first step…"
                      : "Runs appear here while the agent works"}
                  </p>
                ) : (
                  <ol className="trace-list">
                    {trace.map((step) => (
                      <li key={step.id}>
                        <span className="trace-node">{step.node}</span>
                        <span className="trace-detail">{step.detail}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </section>
        </aside>

        <main className="chat">
          <div className="chat-top">
            <h2>Chat</h2>
            {loading && <span className="live-dot">Streaming</span>}
          </div>

          <div className="messages">
            {messages.length === 0 && (
              <div className="empty-chat">
                <p className="empty-lead">
                  Upload a PDF, then ask a question grounded in your documents.
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
              <article
                key={i}
                className={`message ${msg.role}${msg.blocked ? " blocked" : ""}${msg.streaming ? " streaming" : ""}`}
              >
                <div className="message-meta">
                  <span>{msg.role === "user" ? "You" : "DocAgent"}</span>
                  {msg.blocked && <span className="guardrail-tag">Blocked</span>}
                </div>
                <div className="message-body">
                  {msg.role === "assistant" ? (
                    <>
                      <ReactMarkdown>
                        {normalizeAssistantMarkdown(msg.content || " ")}
                      </ReactMarkdown>
                      {msg.streaming && <span className="cursor" aria-hidden />}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.grade && !msg.streaming && <GradePill grade={msg.grade} />}
                {msg.citations && msg.citations.length > 0 && !msg.streaming && (
                  <CitationList citations={msg.citations} />
                )}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="composer">
            <textarea
              value={question}
              placeholder="Ask about your documents…"
              rows={2}
              disabled={loading}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
            />
            <button
              type="button"
              className="ask-btn"
              disabled={loading || !question.trim()}
              onClick={handleAsk}
            >
              {loading ? "…" : "Ask"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
