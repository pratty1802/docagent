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
