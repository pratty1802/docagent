/**
 * Query rewrite — turn vague questions into better retrieval queries.
 *
 * LEARNING: "what is this doc about" is weak for embeddings; rewriting improves recall.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel, getChatTimeoutMs, withTimeout } from "../lib/llm.js";
import { logger } from "../lib/logger.js";

const REWRITE_PROMPT = `Rewrite the user question into a short search query for document retrieval.
Keep key nouns and entities. Do not answer the question. Return only the rewritten query text.
If the question is already specific, return it unchanged.`;

export async function rewriteQuery(question: string): Promise<string> {
  const trimmed = question.trim();
  if (trimmed.length < 8) return trimmed;

  try {
    const llm = createChatModel(0);
    const raw = await withTimeout(
      llm.invoke([
        new SystemMessage(REWRITE_PROMPT),
        new HumanMessage(trimmed),
      ]),
      Math.min(getChatTimeoutMs(), 20_000),
      "Query rewrite",
    );
    const text =
      typeof raw.content === "string"
        ? raw.content.trim()
        : Array.isArray(raw.content)
          ? raw.content
              .map((part) => {
                if (typeof part === "string") return part;
                if (part && typeof part === "object" && "text" in part) {
                  return String((part as { text?: string }).text ?? "");
                }
                return "";
              })
              .join("")
              .trim()
          : "";
    return text || trimmed;
  } catch (err) {
    logger.warn({ err }, "Query rewrite failed — using original question");
    return trimmed;
  }
}
