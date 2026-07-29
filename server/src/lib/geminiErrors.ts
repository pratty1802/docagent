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

  if (status === 429 || message.includes("429") || message.includes("quota")) {
    return new AppError(
      "Gemini API rate limit reached. Wait about a minute and try again. If this keeps happening, set GEMINI_CHAT_MODEL=gemini-2.5-flash in .env.",
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

  if (status === 400) {
    return new AppError(
      "Gemini rejected the request. Try a shorter question or re-upload the PDF.",
      400,
      "GEMINI_BAD_REQUEST",
    );
  }

  return null;
}
