/**
 * Agent runner — invoke or stream LangGraph with document scope.
 *
 * LEARNING: graph.stream({ streamMode: "updates" }) emits each node delta so
 * the UI can show live trace + answer progress. See LEARNING.md § Streaming.
 */
import { HumanMessage } from "@langchain/core/messages";
import { createAgentGraph } from "./graph.js";
import type {
  AgentTraceStep,
  ChatResponse,
  StreamEvent,
} from "../types.js";

export type StreamEventHandler = (event: StreamEvent) => void | Promise<void>;

function toChatResponse(result: {
  draftAnswer?: string;
  blockReason?: string;
  citations?: ChatResponse["citations"];
  grade?: ChatResponse["grade"];
  trace?: AgentTraceStep[];
  critiqueIterations?: number;
  blocked?: boolean;
}): ChatResponse {
  return {
    answer: result.draftAnswer || result.blockReason || "No answer generated.",
    citations: result.citations ?? [],
    grade: result.grade ?? null,
    trace: result.trace ?? [],
    iterations: result.critiqueIterations ?? 0,
    blocked: Boolean(result.blocked),
    blockReason: result.blockReason || undefined,
  };
}

function setDocumentFilter(documentIds: string[]) {
  (globalThis as { __docagent_filter_ids?: string[] }).__docagent_filter_ids =
    documentIds.length > 0 ? documentIds : undefined;
}

export async function runAgent(
  question: string,
  documentIds: string[] = [],
): Promise<ChatResponse> {
  setDocumentFilter(documentIds);

  const graph = createAgentGraph();
  const result = await graph.invoke({
    question,
    documentIds,
    messages: [new HumanMessage(question)],
  });

  return toChatResponse(result);
}

/**
 * Stream agent progress via SSE-friendly events.
 * Emits trace steps and answer token deltas as LangGraph nodes update.
 */
export async function runAgentStream(
  question: string,
  documentIds: string[] = [],
  onEvent: StreamEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  setDocumentFilter(documentIds);

  const graph = createAgentGraph();
  const seenTraceIds = new Set<string>();
  let lastAnswer = "";
  let finalState: Record<string, unknown> = {
    question,
    documentIds,
    messages: [new HumanMessage(question)],
    draftAnswer: "",
    citations: [],
    grade: null,
    trace: [],
    critiqueIterations: 0,
    blocked: false,
    blockReason: "",
  };

  const stream = await graph.stream(
    {
      question,
      documentIds,
      messages: [new HumanMessage(question)],
    },
    { streamMode: "updates" },
  );

  for await (const update of stream) {
    if (signal?.aborted) {
      break;
    }

    // update is { nodeName: partialState }
    for (const partial of Object.values(update)) {
      if (!partial || typeof partial !== "object") continue;
      const patch = partial as Record<string, unknown>;
      finalState = { ...finalState, ...patch };

      const steps = patch.trace as AgentTraceStep[] | undefined;
      if (Array.isArray(steps)) {
        for (const step of steps) {
          if (!seenTraceIds.has(step.id)) {
            seenTraceIds.add(step.id);
            await onEvent({ type: "trace", step });
          }
        }
      }

      const draft = typeof patch.draftAnswer === "string" ? patch.draftAnswer : null;
      if (draft !== null && draft.length > lastAnswer.length && draft.startsWith(lastAnswer)) {
        const delta = draft.slice(lastAnswer.length);
        lastAnswer = draft;
        if (delta) {
          await onEvent({ type: "token", text: delta });
        }
      } else if (draft !== null && draft !== lastAnswer) {
        lastAnswer = draft;
        await onEvent({ type: "token", text: draft, replace: true });
      }
    }
  }

  if (signal?.aborted) {
    return;
  }

  const response = toChatResponse({
    draftAnswer: String(finalState.draftAnswer ?? lastAnswer),
    blockReason: String(finalState.blockReason ?? ""),
    citations: finalState.citations as ChatResponse["citations"],
    grade: finalState.grade as ChatResponse["grade"],
    trace: finalState.trace as AgentTraceStep[],
    critiqueIterations: Number(finalState.critiqueIterations ?? 0),
    blocked: Boolean(finalState.blocked),
  });

  // If we never streamed tokens (e.g. blocked early), push answer once
  if (!lastAnswer && response.answer) {
    await onEvent({ type: "token", text: response.answer });
  }

  await onEvent({ type: "final", ...response });
}
