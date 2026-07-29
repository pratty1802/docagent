/**
 * Agent tools — scoped to the vector store only (no arbitrary HTTP).
 *
 * LEARNING: Limiting tool surface area is a key agent guardrail.
 * See LEARNING.md § Tools.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getConfig } from "../../config.js";
import type { SearchHit, DocumentMeta, DocumentChunk } from "../../types.js";
import {
  getChunksByDocument,
  listDocuments,
  searchDocuments,
} from "../../rag/store.js";

export const searchDocumentsTool = tool(
  async ({ query, topK }) => {
    const documentIds = (globalThis as { __docagent_filter_ids?: string[] }).__docagent_filter_ids;
    const hits = await searchDocuments(query, {
      topK: topK ?? 5,
      documentIds,
      minScore: getConfig().MIN_SIMILARITY_SCORE,
    });

    if (hits.length === 0) {
      return "No relevant passages found above the similarity threshold.";
    }

    return hits
      .map(
        (h: SearchHit, i: number) =>
          `[${i + 1}] ${h.filename} page ${h.page} (score ${h.score.toFixed(3)})\n${h.content}`,
      )
      .join("\n\n---\n\n");
  },
  {
    name: "search_documents",
    description: "Semantic search across uploaded documents. Use before answering factual questions.",
    schema: z.object({
      query: z.string().describe("Search query"),
      topK: z.number().int().min(1).max(10).optional().describe("Max passages to return"),
    }),
  },
);

export const listDocumentsTool = tool(
  async () => {
    const docs = await listDocuments();
    if (docs.length === 0) return "No documents uploaded yet.";
    return docs
      .map(
        (d: DocumentMeta) =>
          `- ${d.filename} (id: ${d.id}, pages: ${d.pageCount}, chunks: ${d.chunkCount})`,
      )
      .join("\n");
  },
  {
    name: "list_documents",
    description: "List all uploaded documents with metadata.",
    schema: z.object({}),
  },
);

export const extractFactsTool = tool(
  async ({ documentId, maxChunks }) => {
    const chunks = await getChunksByDocument(documentId);
    const limit = maxChunks ?? 5;
    const slice = chunks.slice(0, limit);
    if (slice.length === 0) return "No chunks found for that document.";
    return slice
      .map((c: DocumentChunk) => `[page ${c.page}] ${c.content}`)
      .join("\n\n---\n\n");
  },
  {
    name: "extract_facts",
    description: "Read raw text chunks from a specific document by ID.",
    schema: z.object({
      documentId: z.string().describe("Document UUID"),
      maxChunks: z.number().int().min(1).max(20).optional(),
    }),
  },
);

export const allTools = [searchDocumentsTool, listDocumentsTool, extractFactsTool];
