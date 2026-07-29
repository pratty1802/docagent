/**
 * LLM timeouts and chat model factory.
 */
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getConfig } from "../config.js";
import { embedDocuments, embedQuery } from "./embeddings.js";

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, context = "LLM request") {
    super(`${context} timed out after ${timeoutMs}ms. Try again or increase LLM_CHAT_TIMEOUT_MS in .env`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function createChatModel(temperature = 0.2) {
  const { GOOGLE_API_KEY, GEMINI_CHAT_MODEL } = getConfig();
  return new ChatGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY,
    model: GEMINI_CHAT_MODEL,
    temperature,
    maxRetries: 1,
  });
}

export function createEmbeddings() {
  return { embedQuery, embedDocuments };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, context = "LLM request"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms, context)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export function getChatTimeoutMs(): number {
  return getConfig().LLM_CHAT_TIMEOUT_MS;
}

export function getEmbedTimeoutMs(): number {
  return getConfig().EMBED_TIMEOUT_MS;
}
