import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "../config.js";
import { pingSupabase } from "../lib/supabase.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const supabaseOk = await pingSupabase();
  const { GEMINI_CHAT_MODEL, GEMINI_EMBED_MODEL, GOOGLE_API_KEY } = getConfig();
  res.json({
    status: supabaseOk ? "ok" : "degraded",
    supabase: supabaseOk,
    chatModel: GEMINI_CHAT_MODEL,
    embedModel: GEMINI_EMBED_MODEL,
    apiKeyChars: GOOGLE_API_KEY.length,
    apiKeySuffix: GOOGLE_API_KEY.slice(-4),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Live Gemini probe — returns Google's real error so Render misconfig is visible.
 * Safe: never returns the API key.
 */
healthRouter.get("/health/gemini", async (_req, res) => {
  const { GOOGLE_API_KEY, GEMINI_CHAT_MODEL, GEMINI_EMBED_MODEL, EMBEDDING_DIMENSIONS } =
    getConfig();
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

  const chat = await probeChat(genAI, GEMINI_CHAT_MODEL);
  const embed = await probeEmbed(genAI, GEMINI_EMBED_MODEL, EMBEDDING_DIMENSIONS);

  const ok = chat.ok && embed.ok;
  res.status(ok ? 200 : 502).json({
    ok,
    chatModel: GEMINI_CHAT_MODEL,
    embedModel: GEMINI_EMBED_MODEL,
    apiKeyChars: GOOGLE_API_KEY.length,
    apiKeySuffix: GOOGLE_API_KEY.slice(-4),
    chat,
    embed,
  });
});

async function probeChat(genAI: GoogleGenerativeAI, modelName: string) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Reply with exactly: ok");
    const text = result.response.text().trim();
    return { ok: true as const, sample: text.slice(0, 40) };
  } catch (err: unknown) {
    return geminiFail(err);
  }
}

async function probeEmbed(
  genAI: GoogleGenerativeAI,
  modelName: string,
  dimensions: number,
) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.embedContent({
      content: { role: "user", parts: [{ text: "health check" }] },
      outputDimensionality: dimensions,
    } as Parameters<typeof model.embedContent>[0]);
    const dims = result.embedding?.values?.length ?? 0;
    return { ok: dims === dimensions, dims, expected: dimensions };
  } catch (err: unknown) {
    return geminiFail(err);
  }
}

function geminiFail(err: unknown) {
  const status =
    err && typeof err === "object" && "status" in err
      ? (err as { status?: number }).status
      : undefined;
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false as const,
    status,
    message: message.replace(/\s+/g, " ").slice(0, 400),
  };
}
