import type { ChatResponse, DocumentMeta } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchDocuments(): Promise<DocumentMeta[]> {
  const data = await request<{ documents: DocumentMeta[] }>("/api/documents");
  return data.documents;
}

export async function uploadDocument(file: File): Promise<DocumentMeta> {
  const form = new FormData();
  form.append("file", file);
  const data = await request<{ document: DocumentMeta }>("/api/documents", {
    method: "POST",
    body: form,
  });
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  await request<void>(`/api/documents/${id}`, { method: "DELETE" });
}

export async function sendChat(
  question: string,
  documentIds?: string[],
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, documentIds }),
  });
}
