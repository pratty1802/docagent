/**
 * Agent node — retrieve passages then generate (no multi-turn tool loop).
 *
 * LEARNING: Newer Gemini aliases require thought signatures for function-calling
 * loops; LangChain 0.2.x does not preserve them. Explicit retrieve→generate keeps
 * the LangGraph agent reliable on free-tier / new API keys.
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getConfig } from "../../config.js";
import { AGENT_SYSTEM_PROMPT } from "../../guardrails/prompts.js";
import { createChatModel, getChatTimeoutMs, withTimeout } from "../../lib/llm.js";
import { searchDocuments } from "../../rag/store.js";
import type { AgentStateType } from "../state.js";
import { createTraceStep } from "../trace.js";

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: string }).text ?? "");
      }
      return "";
    })
    .join("");
}

export async function agentNode(state: AgentStateType) {
  const { MIN_SIMILARITY_SCORE, SEARCH_TOP_K } = getConfig();
  const documentIds =
    state.documentIds.length > 0 ? state.documentIds : undefined;

  const hits = await searchDocuments(state.question, {
    topK: SEARCH_TOP_K,
    documentIds,
    minScore: MIN_SIMILARITY_SCORE,
  });

  const context =
    hits.length === 0
      ? "No relevant passages found above the similarity threshold."
      : hits
          .map(
            (h, i) =>
              `[${i + 1}] ${h.filename} page ${h.page} (score ${h.score.toFixed(3)})\n${h.content}`,
          )
          .join("\n\n---\n\n");

  const llm = createChatModel();
  const response = await withTimeout(
    llm.invoke([
      new SystemMessage(AGENT_SYSTEM_PROMPT),
      new HumanMessage(
        `Question:\n${state.question}\n\nRetrieved passages:\n${context}\n\nWrite the answer now.`,
      ),
    ]),
    getChatTimeoutMs(),
    "Agent model call",
  );

  const draft = messageText(response.content).trim();
  const ai = new AIMessage(draft || "I could not find that information in the documents.");

  return {
    messages: [ai],
    draftAnswer: ai.content as string,
    readyForCritique: true,
    toolIterations: state.toolIterations + 1,
    trace: [
      createTraceStep(
        "retrieve",
        "done",
        hits.length === 0
          ? "No passages above threshold"
          : `Retrieved ${hits.length} passage(s)`,
      ),
      createTraceStep("agent", "done", "Draft answer ready"),
    ],
  };
}
