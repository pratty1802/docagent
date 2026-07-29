import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { getConfig } from "../config.js";
import { runAgent, runAgentStream } from "../agent/run.js";
import { AppError } from "../lib/errors.js";
import { mapGeminiError } from "../lib/geminiErrors.js";
import { TimeoutError } from "../lib/llm.js";
import { createChatRateLimiter } from "../middleware/rateLimit.js";
import type { StreamEvent } from "../types.js";

const chatSchema = z.object({
  question: z.string().min(1),
  documentIds: z.array(z.string().uuid()).max(getConfig().MAX_DOCUMENT_IDS).optional(),
});

export const chatRouter = Router();

function writeSse(res: Response, event: StreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  const flushable = res as Response & { flush?: () => void };
  flushable.flush?.();
}

chatRouter.post("/", createChatRateLimiter(), async (req, res, next) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400, "VALIDATION_ERROR");
    }

    const { question, documentIds } = parsed.data;
    const result = await runAgent(question, documentIds ?? []);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * SSE streaming chat — live trace + answer tokens.
 * LEARNING: Keep the connection open; emit data: JSON lines. See LEARNING.md § Streaming.
 */
chatRouter.post("/stream", createChatRateLimiter(), async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid request",
      code: "VALIDATION_ERROR",
    });
    return;
  }

  const { question, documentIds } = parsed.data;
  const abort = new AbortController();

  req.on("close", () => {
    abort.abort();
  });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": ping\n\n");
    }
  }, 15_000);

  try {
    await runAgentStream(
      question,
      documentIds ?? [],
      async (event) => {
        if (abort.signal.aborted || res.writableEnded) return;
        writeSse(res, event);
      },
      abort.signal,
    );
  } catch (err) {
    if (!abort.signal.aborted && !res.writableEnded) {
      const gemini = mapGeminiError(err);
      if (gemini) {
        writeSse(res, { type: "error", error: gemini.message, code: gemini.code });
      } else if (err instanceof TimeoutError) {
        writeSse(res, { type: "error", error: err.message, code: "TIMEOUT" });
      } else if (err instanceof AppError) {
        writeSse(res, { type: "error", error: err.message, code: err.code });
      } else {
        writeSse(res, {
          type: "error",
          error: err instanceof Error ? err.message : "Stream failed",
          code: "STREAM_ERROR",
        });
      }
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
});
