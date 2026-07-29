/**
 * Supabase pgvector document store.
 *
 * LEARNING: Embeddings are stored in Postgres; similarity search runs via
 * the match_document_chunks RPC. Threshold tuning affects recall vs precision.
 * See LEARNING.md § Vector store.
 */
import { randomUUID } from "node:crypto";
import { getConfig } from "../config.js";
import { AppError } from "../lib/errors.js";
import { createEmbeddings, getEmbedTimeoutMs, withTimeout } from "../lib/llm.js";
import { getSupabase } from "../lib/supabase.js";
import { hybridScore, keywordOverlapScore } from "./hybrid.js";
import { rewriteQuery } from "./rewrite.js";
import type { DocumentChunk, DocumentMeta, SearchHit } from "../types.js";

type MatchRow = {
  id: string;
  document_id: string;
  filename: string;
  page: number;
  chunk_index: number;
  content: string;
  score: number;
};

export async function listDocuments(): Promise<DocumentMeta[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) throw new AppError(error.message, 500, "DB_ERROR");

  return (data ?? []).map((row) => ({
    id: row.id,
    filename: row.filename,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    charCount: row.char_count,
    uploadedAt: row.uploaded_at,
  }));
}

export async function deleteDocument(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500, "DB_ERROR");
}

export async function searchDocuments(
  query: string,
  options: {
    topK?: number;
    documentIds?: string[];
    minScore?: number;
    rewrite?: boolean;
  } = {},
): Promise<SearchHit[]> {
  const { MIN_SIMILARITY_SCORE, SEARCH_TOP_K, SEARCH_CANDIDATE_K, HYBRID_ALPHA } =
    getConfig();
  const topK = options.topK ?? SEARCH_TOP_K;
  const minScore = options.minScore ?? MIN_SIMILARITY_SCORE;
  const searchQuery =
    options.rewrite === false ? query : await rewriteQuery(query);

  const embeddings = createEmbeddings();
  const queryVector = await withTimeout(
    embeddings.embedQuery(searchQuery),
    getEmbedTimeoutMs(),
    "Embedding query",
  );

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryVector,
    match_count: Math.max(topK, SEARCH_CANDIDATE_K),
    filter_document_ids:
      options.documentIds && options.documentIds.length > 0
        ? options.documentIds
        : null,
    // Fetch a wider band; hybrid re-rank + minScore filter below
    min_score: Math.max(0, minScore - 0.15),
  });

  if (error) throw new AppError(error.message, 500, "DB_ERROR");

  const hits: SearchHit[] = ((data as MatchRow[]) ?? []).map((row) => {
    const vectorScore = row.score;
    const lexical = keywordOverlapScore(searchQuery, row.content);
    return {
      id: row.id,
      documentId: row.document_id,
      filename: row.filename,
      page: row.page,
      chunkIndex: row.chunk_index,
      content: row.content,
      score: hybridScore(vectorScore, lexical, HYBRID_ALPHA),
    };
  });

  return hits
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function insertDocument(
  meta: Omit<DocumentMeta, "id" | "uploadedAt">,
  chunks: Array<Omit<DocumentChunk, "id" | "documentId"> & { embedding: number[] }>,
): Promise<DocumentMeta> {
  const documentId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const supabase = getSupabase();

  const { error: docError } = await supabase.from("documents").insert({
    id: documentId,
    filename: meta.filename,
    page_count: meta.pageCount,
    chunk_count: meta.chunkCount,
    char_count: meta.charCount,
    uploaded_at: uploadedAt,
  });

  if (docError) throw new AppError(docError.message, 500, "DB_ERROR");

  const rows = chunks.map((chunk) => ({
    id: randomUUID(),
    document_id: documentId,
    filename: chunk.filename,
    page: chunk.page,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    embedding: chunk.embedding,
  }));

  const { error: chunkError } = await supabase.from("document_chunks").insert(rows);
  if (chunkError) {
    await supabase.from("documents").delete().eq("id", documentId);
    throw new AppError(chunkError.message, 500, "DB_ERROR");
  }

  return {
    id: documentId,
    filename: meta.filename,
    pageCount: meta.pageCount,
    chunkCount: meta.chunkCount,
    charCount: meta.charCount,
    uploadedAt,
  };
}

export async function getChunksByDocument(documentId: string): Promise<DocumentChunk[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, filename, page, chunk_index, content")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (error) throw new AppError(error.message, 500, "DB_ERROR");

  return (data ?? []).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    filename: row.filename,
    page: row.page,
    chunkIndex: row.chunk_index,
    content: row.content,
  }));
}
