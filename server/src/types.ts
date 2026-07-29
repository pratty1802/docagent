export type DocumentMeta = {
  id: string;
  filename: string;
  pageCount: number;
  chunkCount: number;
  charCount: number;
  uploadedAt: string;
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  filename: string;
  page: number;
  chunkIndex: number;
  content: string;
};

export type Citation = {
  documentId: string;
  filename: string;
  page: number;
  chunkId: string;
  excerpt: string;
  score: number;
};

export type AgentTraceStep = {
  id: string;
  node: string;
  status: "running" | "done" | "error";
  detail: string;
  at: string;
};

export type GroundednessGrade = {
  score: number;
  rationale: string;
  grounded: boolean;
};

export type ChatRequest = {
  question: string;
  documentIds?: string[];
};

export type ChatResponse = {
  answer: string;
  citations: Citation[];
  grade: GroundednessGrade | null;
  trace: AgentTraceStep[];
  iterations: number;
  blocked: boolean;
  blockReason?: string;
};

export type SearchHit = DocumentChunk & { score: number };

/** SSE event payloads for POST /api/chat/stream */
export type StreamTraceEvent = {
  type: "trace";
  step: AgentTraceStep;
};

export type StreamTokenEvent = {
  type: "token";
  text: string;
  /** When true, UI should replace the assistant message, not append */
  replace?: boolean;
};

export type StreamFinalEvent = {
  type: "final";
} & ChatResponse;

export type StreamErrorEvent = {
  type: "error";
  error: string;
  code: string;
};

export type StreamEvent =
  | StreamTraceEvent
  | StreamTokenEvent
  | StreamFinalEvent
  | StreamErrorEvent;
