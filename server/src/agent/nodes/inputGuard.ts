/**
 * Input guard node — blocks bad questions before any LLM call.
 */
import { AIMessage } from "@langchain/core/messages";
import { validateQuestion } from "../../guardrails/input.js";
import { BLOCKED_USER_MESSAGE } from "../../guardrails/prompts.js";
import type { AgentStateType } from "../state.js";
import { createTraceStep } from "../trace.js";

export async function inputGuardNode(state: AgentStateType) {
  const result = validateQuestion(state.question);

  if (!result.allowed) {
    return {
      blocked: true,
      blockReason: result.reason ?? "Blocked by input guard",
      draftAnswer: BLOCKED_USER_MESSAGE,
      messages: [new AIMessage(BLOCKED_USER_MESSAGE)],
      trace: [
        createTraceStep("input_guard", "done", `Blocked: ${result.reason ?? "policy"}`),
      ],
    };
  }

  return {
    trace: [createTraceStep("input_guard", "done", "Input passed guardrails")],
  };
}
