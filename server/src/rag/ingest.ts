/**
 * PDF ingest pipeline: extract → chunk → embed → store in pgvector.
 *
 * LEARNING: RAG quality starts here — bad extraction or chunking breaks retrieval.
 * See LEARNING.md § Ingest pipeline.
 */
import pdf from "pdf-parse";
import { createEmbeddings, getEmbedTimeoutMs, withTimeout } from "../lib/llm.js";
import { AppError } from "../lib/errors.js";
import { getConfig } from "../config.js";
import { validateDocumentLimits } from "../guardrails/upload.js";
import { chunkDocumentText } from "./chunker.js";
import { insertDocument } from "./store.js";
import type { DocumentMeta } from "../types.js";

export type IngestResult = { document: DocumentMeta };

export async function ingestPdf(buffer: Buffer, filename: string): Promise<IngestResult> {
  const extracted = await pdf(buffer);
  const pageCount = extracted.numpages || 1;
  const withMarkers = injectPageMarkers(extracted.text, pageCount);

  if (!withMarkers.trim()) {
    throw new AppError(
      "Could not extract text from this PDF (it may be scanned/image-only)",
      422,
      "EMPTY_PDF",
    );
  }

  const textChunks = await chunkDocumentText(withMarkers);
  if (textChunks.length === 0) {
    throw new AppError("PDF produced no usable chunks", 422, "EMPTY_CHUNKS");
  }

  validateDocumentLimits(pageCount, textChunks.length);

  const embeddings = createEmbeddings();
  const embedTimeout = getEmbedTimeoutMs() * Math.max(1, Math.ceil(textChunks.length / 20));
  const vectors = await withTimeout(
    embeddings.embedDocuments(textChunks.map((c) => c.content)),
    embedTimeout,
    "Document embedding batch",
  );

  const chunksWithEmbeddings = textChunks.map((chunk, index) => {
    const embedding = vectors[index];
    if (!embedding) {
      throw new AppError("Embedding generation failed", 500, "EMBED_FAILED");
    }
    return {
      filename,
      page: chunk.page,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding,
    };
  });

  const document = await insertDocument(
    {
      filename,
      pageCount,
      chunkCount: textChunks.length,
      charCount: withMarkers.length,
    },
    chunksWithEmbeddings,
  );

  return { document };
}

function injectPageMarkers(text: string, pageCount: number): string {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (pageCount <= 1) return `\n\n--- page 1 ---\n\n${cleaned}`;

  // Prefer form-feed breaks (common in PDF extractors)
  const formFeedParts = cleaned.split(/\f+/).map((p) => p.trim()).filter(Boolean);
  if (formFeedParts.length >= 2) {
    return formFeedParts
      .map((part, i) => `\n\n--- page ${i + 1} ---\n\n${part}`)
      .join("");
  }

  // Heuristic: split on multiple blank lines when pageCount is known
  const paraBlocks = cleaned.split(/\n{3,}/).map((p) => p.trim()).filter(Boolean);
  if (paraBlocks.length >= pageCount && pageCount > 1) {
    const perPage = Math.ceil(paraBlocks.length / pageCount);
    const parts: string[] = [];
    for (let i = 0; i < pageCount; i += 1) {
      const slice = paraBlocks.slice(i * perPage, (i + 1) * perPage).join("\n\n").trim();
      if (slice) parts.push(`\n\n--- page ${i + 1} ---\n\n${slice}`);
    }
    if (parts.length > 0) return parts.join("");
  }

  // Fallback: equal character windows aligned to paragraph boundaries when possible
  const size = Math.ceil(cleaned.length / pageCount);
  const parts: string[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    let start = i * size;
    let end = Math.min(cleaned.length, (i + 1) * size);
    if (i > 0) {
      const near = cleaned.indexOf("\n\n", start);
      if (near !== -1 && near - start < 200) start = near + 2;
    }
    if (i < pageCount - 1) {
      const near = cleaned.indexOf("\n\n", end);
      if (near !== -1 && near - end < 200) end = near;
    }
    const slice = cleaned.slice(start, end).trim();
    if (slice) parts.push(`\n\n--- page ${i + 1} ---\n\n${slice}`);
  }
  return parts.join("");
}
