/**
 * Agent node — calls Gemini with tool binding.
 */
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel, getChatTimeoutMs, withTimeout } from "../../lib/llm.js";
import { AGENT_SYSTEM_PROMPT } from "../../guardrails/prompts.js";
import { allTools } from "../tools/index.js";
import type { AgentStateType } from "../state.js";
import { createTraceStep } from "../trace.js";

export async function agentNode(state: AgentStateType) {
  const llm = createChatModel().bindTools(allTools);

  const system = new SystemMessage(AGENT_SYSTEM_PROMPT);

  const response = await withTimeout(
    llm.invoke([system, ...state.messages]),
    getChatTimeoutMs(),
    "Agent model call",
  );

  const hasToolCalls =
    "tool_calls" in response &&
    Array.isArray(response.tool_calls) &&
    response.tool_calls.length > 0;

  const draft =
    typeof response.content === "string"
      ? response.content
      : response.content
          .map((c) => (typeof c === "string" ? c : "text" in c ? c.text : ""))
          .join("");

  return {
    messages: [response],
    draftAnswer: hasToolCalls ? state.draftAnswer : draft,
    readyForCritique: !hasToolCalls,
    toolIterations: hasToolCalls ? state.toolIterations + 1 : state.toolIterations,
    trace: [
      createTraceStep(
        "agent",
        "done",
        hasToolCalls ? `Tool calls: ${response.tool_calls?.length ?? 0}` : "Draft answer ready",
      ),
    ],
  };
}
