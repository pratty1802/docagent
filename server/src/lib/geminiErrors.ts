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
  const modelFromUrl = message.match(/models\/([a-zA-Z0-9._-]+)/)?.[1];

  // Prefer explicit status codes — avoid matching "404" inside unrelated text.
  if (
    status === 429 ||
    /\b429\b/.test(message) ||
    /quota exceeded/i.test(message) ||
    /too many requests/i.test(message)
  ) {
    const daily =
      /PerDay/i.test(message) ||
      /per day/i.test(message) ||
      /FreeTier/i.test(message);
    const model =
      message.match(/model:\s*([a-z0-9.-]+)/i)?.[1] ?? modelFromUrl ?? "this model";
    return new AppError(
      daily
        ? `Gemini free-tier quota for ${model} is exhausted on this Google project (every API key in the project shares it — local + Render). Wait for reset, use a key from a new AI Studio project, or enable billing.`
        : "Gemini API rate limit reached. Wait about a minute and try again.",
      429,
      "GEMINI_RATE_LIMIT",
    );
  }

  if (status === 404 || /\b404\b/.test(message)) {
    const requested = modelFromUrl ?? "unknown";
    if (/no longer available to new users/i.test(message)) {
      return new AppError(
        `Gemini model "${requested}" is blocked for new API keys. Set GEMINI_CHAT_MODEL=gemini-flash-latest in .env and on Render, then Manual Deploy.`,
        502,
        "GEMINI_MODEL_ERROR",
      );
    }
    const snippet = message.replace(/\s+/g, " ").slice(0, 220);
    return new AppError(
      `Gemini 404 for model "${requested}". ${snippet} — Set GEMINI_CHAT_MODEL=gemini-flash-latest on Render and Manual Deploy. Check /api/health/gemini.`,
      502,
      "GEMINI_MODEL_ERROR",
    );
  }

  if (
    status === 400 ||
    /\b400\b/.test(message) ||
    message.includes("thought_signature")
  ) {
    if (message.includes("thought_signature") || message.includes("thought_sign")) {
      return new AppError(
        "This Gemini model requires thought signatures for tool calling, which our LangChain version does not support yet. DocAgent uses retrieve-then-generate with GEMINI_CHAT_MODEL=gemini-flash-latest.",
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

  if (status === 403 || /\b403\b/.test(message) || /API key not valid/i.test(message)) {
    return new AppError(
      "Gemini rejected the API key (403). Re-create a key at aistudio.google.com/apikey, paste it into Render GOOGLE_API_KEY, and Manual Deploy.",
      502,
      "GEMINI_AUTH_ERROR",
    );
  }

  return null;
}
