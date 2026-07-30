/**
 * Critique node — hybrid groundedness (similarity gate + LLM grade).
 *
 * LEARNING: Fast similarity rejects empty retrieval; LLM JSON grade catches
 * hallucinations when context exists. Bounded by MAX_CRITIQUE_RETRIES.
 * See LEARNING.md § Critique loop.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getConfig } from "../../config.js";
import { capAnswerLength } from "../../guardrails/output.js";
import { CRITIQUE_SYSTEM_PROMPT } from "../../guardrails/prompts.js";
import { createChatModel, getChatTimeoutMs, withTimeout } from "../../lib/llm.js";
import { searchDocuments } from "../../rag/store.js";
import type { AgentStateType } from "../state.js";
import type { Citation, GroundednessGrade } from "../../types.js";
import { createTraceStep } from "../trace.js";

async function llmGrade(
  question: string,
  answer: string,
  context: string,
): Promise<GroundednessGrade> {
  const llm = createChatModel(0);
  const raw = await withTimeout(
    llm.invoke([
      new SystemMessage(CRITIQUE_SYSTEM_PROMPT),
      new HumanMessage(
        `Question: ${question}\n\nExcerpts:\n${context}\n\nAnswer:\n${answer}`,
      ),
    ]),
    getChatTimeoutMs(),
    "Critique model call",
  );

  const text =
    typeof raw.content === "string"
      ? raw.content
      : raw.content
          .map((c) => (typeof c === "string" ? c : "text" in c ? c.text : ""))
          .join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as GroundednessGrade;
      return {
        score: Number(parsed.score) || 0,
        rationale: parsed.rationale || "LLM critique",
        grounded: Boolean(parsed.grounded),
      };
    }
  } catch {
    // fall through
  }

  return {
    score: 0.6,
    rationale: "Could not parse critique JSON — defaulting permissive",
    grounded: true,
  };
}

export async function critiqueNode(state: AgentStateType) {
  const { MIN_SIMILARITY_SCORE } = getConfig();
  const hits = await searchDocuments(state.question, {
    documentIds: state.documentIds.length > 0 ? state.documentIds : undefined,
    minScore: MIN_SIMILARITY_SCORE,
  });

  const citations: Citation[] = hits.map((h) => ({
    documentId: h.documentId,
    filename: h.filename,
    page: h.page,
    chunkId: h.id,
    excerpt: h.content.slice(0, 300),
    score: h.score,
  }));

  if (citations.length === 0) {
    const msg =
      "I could not find relevant information in your uploaded documents to answer that question.";
    return {
      draftAnswer: msg,
      citations,
      grade: { score: 0, rationale: "No retrieval hits", grounded: false },
      critiqueIterations: state.critiqueIterations + 1,
      trace: [createTraceStep("critique", "done", "No citations — refused to answer")],
    };
  }

  const avgScore =
    citations.reduce((sum, c) => sum + c.score, 0) / citations.length;
  const hasDraft = state.draftAnswer.trim().length > 0;

  let draftAnswer: string;
  if (hasDraft) {
    draftAnswer = capAnswerLength(state.draftAnswer);
  } else {
    const top = citations.slice(0, 3);
    draftAnswer = capAnswerLength(
      `Based on your document(s), here are the most relevant passages:\n\n${top
        .map((c) => `[${c.filename}, page ${c.page}] ${c.excerpt}`)
        .join("\n\n")}`,
    );
  }

  // Fast path: if similarity is weak, skip expensive LLM and mark ungrounded for retry
  if (avgScore < MIN_SIMILARITY_SCORE) {
    return {
      draftAnswer,
      citations,
      grade: {
        grounded: false,
        score: avgScore,
        rationale: "Retrieval similarity below threshold",
      },
      critiqueIterations: state.critiqueIterations + 1,
      readyForCritique: false,
      trace: [
        createTraceStep(
          "critique",
          "done",
          `Weak retrieval (avg ${avgScore.toFixed(2)}) — retry`,
        ),
      ],
    };
  }

  const context = citations
    .map((c, i) => `[${i + 1}] ${c.filename} p.${c.page}\n${c.excerpt}`)
    .join("\n\n");

  let grade: GroundednessGrade;
  try {
    grade = await llmGrade(state.question, draftAnswer, context);
  } catch {
    grade = {
      grounded: true,
      score: avgScore,
      rationale: "LLM critique unavailable — used retrieval similarity",
    };
  }

  return {
    draftAnswer: grade.grounded ? draftAnswer : state.draftAnswer || draftAnswer,
    citations,
    grade,
    critiqueIterations: state.critiqueIterations + 1,
    readyForCritique: false,
    trace: [
      createTraceStep(
        "critique",
        "done",
        `Grounded: ${grade.grounded} (score ${grade.score.toFixed(2)}) — ${grade.rationale}`,
      ),
    ],
  };
}
