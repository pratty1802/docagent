import { useCallback, useEffect, useState } from "react";
import {
  deleteDocument,
  fetchDocuments,
  sendChat,
  uploadDocument,
} from "./api";
import type { AgentTraceStep, ChatMessage, DocumentMeta } from "./types";
import "./App.css";

export default function App() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [trace, setTrace] = useState<AgentTraceStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    if (trimmed.length > 2000) {
      setError("Question must be under 2000 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setQuestion("");
    setTrace([]);

    try {
      const scope = selectedIds.length > 0 ? selectedIds : undefined;
      const result = await sendChat(trimmed, scope);
      setTrace(result.trace);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          blocked: result.blocked,
          citations: result.citations,
          grade: result.grade,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>DocAgent</h1>
          <p className="subtitle">
            Agentic RAG with LangGraph · Gemini · Supabase pgvector
          </p>
        </div>
        <span className="badge">Portfolio Demo</span>
      </header>

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
              <p className="muted">Trace appears after you ask a question</p>
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
              <p className="muted empty-chat">
                Upload a PDF and ask questions grounded in your documents.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`message ${msg.role}${msg.blocked ? " blocked" : ""}`}
              >
                <div className="message-meta">{msg.role}</div>
                <p>{msg.content}</p>
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
              {loading ? "Thinking…" : "Ask"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
