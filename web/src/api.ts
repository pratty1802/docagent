import type {
  AgentTraceStep,
  ChatResponse,
  DocumentMeta,
  StreamEvent,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
    );
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

export type StreamChatHandlers = {
  onTrace?: (step: AgentTraceStep) => void;
  onToken?: (text: string, replace?: boolean) => void;
  onFinal?: (result: ChatResponse) => void;
  onError?: (error: string, code: string) => void;
};

/**
 * Consume POST /api/chat/stream SSE events.
 */
export async function streamChat(
  question: string,
  documentIds: string[] | undefined,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question, documentIds }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Stream failed (${res.status})`,
    );
  }

  if (!res.body) {
    throw new Error("No response body for stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    const json = line.slice(5).trim();
    if (!json) return;

    let event: StreamEvent;
    try {
      event = JSON.parse(json) as StreamEvent;
    } catch {
      return;
    }

    if (event.type === "trace") handlers.onTrace?.(event.step);
    else if (event.type === "token") handlers.onToken?.(event.text, event.replace);
    else if (event.type === "final") {
      const { type: _t, ...rest } = event;
      handlers.onFinal?.(rest);
    } else if (event.type === "error") {
      handlers.onError?.(event.error, event.code);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        dispatch(line);
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      dispatch(line);
    }
  }
}

export async function checkHealth(): Promise<{
  status: string;
  supabase: boolean;
}> {
  return request("/api/health");
}
