import { Router } from "express";
import { z } from "zod";
import { getConfig } from "../config.js";
import { runAgent } from "../agent/run.js";
import { AppError } from "../lib/errors.js";
import { createChatRateLimiter } from "../middleware/rateLimit.js";

const chatSchema = z.object({
  question: z.string().min(1),
  documentIds: z.array(z.string().uuid()).max(getConfig().MAX_DOCUMENT_IDS).optional(),
});

export const chatRouter = Router();

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
