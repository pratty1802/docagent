/**
 * Input guardrails for user questions.
 *
 * LEARNING: Block suspicious input before calling Gemini — saves cost and
 * reduces prompt-injection risk. Heuristics are not perfect but teach the pattern.
 * See LEARNING.md § Input guardrails.
 */
import { getConfig } from "../config.js";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /disregard\s+(the\s+)?(above|system)/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(a\s+)?system/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /jailbreak/i,
  /\bsystem\s*:\s*/i,
];

export type InputGuardResult = {
  allowed: boolean;
  reason?: string;
};

export function validateQuestion(question: string): InputGuardResult {
  const trimmed = question.trim();
  const { MAX_QUESTION_LENGTH } = getConfig();

  if (!trimmed) {
    return { allowed: false, reason: "Question cannot be empty." };
  }

  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      allowed: false,
      reason: `Question exceeds maximum length of ${MAX_QUESTION_LENGTH} characters.`,
    };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: "Request blocked: potential prompt injection detected.",
      };
    }
  }

  return { allowed: true };
}
