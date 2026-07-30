/**
 * Maps Google Generative AI SDK errors to user-friendly AppErrors.
 */
import { AppError } from "./errors.js";

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function mapGeminiError(err: unknown): AppError | null {
  const status = getErrorStatus(err);
  const message = getErrorMessage(err);

  if (
    status === 429 ||
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("Quota exceeded") ||
    message.includes("Too Many Requests")
  ) {
    const daily = message.includes("PerDay") || message.includes("per day");
    return new AppError(
      daily
        ? "Gemini free-tier daily quota is exhausted for this model (often ~20 requests/day). Wait until it resets, use a new API key, or set GEMINI_CHAT_MODEL=gemini-2.0-flash-lite in .env."
        : "Gemini API rate limit reached. Wait about a minute and try again.",
      429,
      "GEMINI_RATE_LIMIT",
    );
  }

  if (status === 404 || message.includes("404")) {
    return new AppError(
      "Gemini model not found. Check GEMINI_CHAT_MODEL in .env (try gemini-2.5-flash).",
      502,
      "GEMINI_MODEL_ERROR",
    );
  }

  if (
    status === 400 ||
    message.includes("400") ||
    message.includes("thought_signature")
  ) {
    if (message.includes("thought_signature") || message.includes("thought_sign")) {
      return new AppError(
        "This Gemini model requires thought signatures for tool calling, which our LangChain version does not support yet. Set GEMINI_CHAT_MODEL=gemini-2.5-flash in .env (and on Render).",
        400,
        "GEMINI_THOUGHT_SIGNATURE",
      );
    }
    return new AppError(
      "Gemini rejected the request. Try a shorter question or re-upload the PDF.",
      400,
      "GEMINI_BAD_REQUEST",
    );
  }

  return null;
}
