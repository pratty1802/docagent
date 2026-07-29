/**
 * Output guardrails applied after the agent drafts an answer.
 *
 * LEARNING: Length caps prevent runaway generations on free API tiers.
 * See LEARNING.md § Output guardrails.
 */
import { getConfig } from "../config.js";

export function capAnswerLength(answer: string): string {
  const { MAX_ANSWER_LENGTH } = getConfig();
  if (answer.length <= MAX_ANSWER_LENGTH) return answer;
  return `${answer.slice(0, MAX_ANSWER_LENGTH)}\n\n[Response truncated for length.]`;
}
