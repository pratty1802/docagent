/**
 * Agent runner — invokes the compiled LangGraph with document scope.
 */
import { HumanMessage } from "@langchain/core/messages";
import { createAgentGraph } from "./graph.js";
import type { ChatResponse } from "../types.js";

export async function runAgent(
  question: string,
  documentIds: string[] = [],
): Promise<ChatResponse> {
  // Tool filter scope for search_documents (server-side, not user-controlled in tools)
  (globalThis as { __docagent_filter_ids?: string[] }).__docagent_filter_ids =
    documentIds.length > 0 ? documentIds : undefined;

  const graph = createAgentGraph();
  const result = await graph.invoke({
    question,
    documentIds,
    messages: [new HumanMessage(question)],
  });

  return {
    answer: result.draftAnswer || result.blockReason || "No answer generated.",
    citations: result.citations,
    grade: result.grade,
    trace: result.trace,
    iterations: result.critiqueIterations,
    blocked: result.blocked,
    blockReason: result.blockReason || undefined,
  };
}
