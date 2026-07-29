/**
 * Gemini embeddings via @google/generative-ai (768-dim for pgvector).
 *
 * LEARNING: text-embedding-004 is NOT on the free AI Studio API — it 404s and
 * LangChain silently returns empty vectors. We use gemini-embedding-001 with
 * outputDimensionality=768 to match our pgvector schema. See LEARNING.md § Embeddings.
 */
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { getConfig } from "../config.js";
import { AppError } from "./errors.js";

function getClient() {
  const { GOOGLE_API_KEY, GEMINI_EMBED_MODEL } = getConfig();
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  return genAI.getGenerativeModel({ model: GEMINI_EMBED_MODEL });
}

function assertValidEmbedding(values: number[] | undefined, context: string): number[] {
  if (!values || values.length === 0) {
    throw new AppError(
      `Embedding API returned an empty vector (${context}). Check GEMINI_EMBED_MODEL (use gemini-embedding-001).`,
      500,
      "EMBED_FAILED",
    );
  }
  const { EMBEDDING_DIMENSIONS } = getConfig();
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new AppError(
      `Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${values.length}. Update EMBEDDING_DIMENSIONS or schema.sql.`,
      500,
      "EMBED_DIM_MISMATCH",
    );
  }
  return values;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { EMBEDDING_DIMENSIONS } = getConfig();
  const model = getClient();
  const res = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    taskType: TaskType.RETRIEVAL_QUERY,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  } as Parameters<typeof model.embedContent>[0]);
  return assertValidEmbedding(res.embedding?.values, "embedQuery");
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const { EMBEDDING_DIMENSIONS } = getConfig();
  const model = getClient();
  const batchSize = 100;
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const res = await model.batchEmbedContents({
      requests: chunk.map((text) => ({
        content: { role: "user", parts: [{ text }] },
        taskType: TaskType.RETRIEVAL_DOCUMENT,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    });

    if (!res.embeddings || res.embeddings.length !== chunk.length) {
      throw new AppError("Embedding batch size mismatch", 500, "EMBED_FAILED");
    }

    for (let j = 0; j < res.embeddings.length; j += 1) {
      all.push(assertValidEmbedding(res.embeddings[j]?.values, `embedDocuments[${i + j}]`));
    }
  }

  return all;
}
