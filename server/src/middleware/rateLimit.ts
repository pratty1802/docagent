/**
 * Rate limiting for expensive endpoints.
 *
 * LEARNING: Free-tier APIs and embeddings cost money/quota — per-IP limits
 * reduce abuse on a public demo. See LEARNING.md § Rate limiting.
 */
import rateLimit from "express-rate-limit";
import { getConfig } from "../config.js";

export function createChatRateLimiter() {
  const { RATE_LIMIT_CHAT } = getConfig();
  return rateLimit({
    windowMs: 60 * 1000,
    max: RATE_LIMIT_CHAT,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many chat requests. Please wait a minute.", code: "RATE_LIMITED" },
  });
}

export function createUploadRateLimiter() {
  const { RATE_LIMIT_UPLOAD } = getConfig();
  return rateLimit({
    windowMs: 60 * 1000,
    max: RATE_LIMIT_UPLOAD,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many uploads. Please wait a minute.", code: "RATE_LIMITED" },
  });
}
