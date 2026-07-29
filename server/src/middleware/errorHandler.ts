/**
 * Central error handler — safe messages to clients, full detail in logs.
 *
 * LEARNING: Never send stack traces to clients in production.
 */
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";
import { TimeoutError } from "../lib/llm.js";
import { mapGeminiError } from "../lib/geminiErrors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId ?? "unknown";

  if (err instanceof AppError) {
    logger.warn({ err, requestId, code: err.code }, err.message);
    res.status(err.status).json({ error: err.message, code: err.code, requestId });
    return;
  }

  if (err instanceof TimeoutError) {
    logger.warn({ err, requestId }, err.message);
    res.status(504).json({ error: err.message, code: "TIMEOUT", requestId });
    return;
  }

  const geminiErr = mapGeminiError(err);
  if (geminiErr) {
    logger.warn({ err, requestId, code: geminiErr.code }, geminiErr.message);
    res.status(geminiErr.status).json({ error: geminiErr.message, code: geminiErr.code, requestId });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    requestId,
  });
}
