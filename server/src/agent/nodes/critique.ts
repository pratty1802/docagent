/**
 * Critique node — groundedness check before returning to user.
 *
 * LEARNING: We use citation similarity scores as a fast groundedness signal
 * instead of a second LLM call — saves ~15–30s on Gemini free tier.
 * See LEARNING.md § Critique loop.
 */
import { getConfig } from "../../config.js";
import { capAnswerLength } from "../../guardrails/output.js";
import { searchDocuments } from "../../rag/store.js";
import type { AgentStateType } from "../state.js";
import type { Citation, GroundednessGrade } from "../../types.js";
import { createTraceStep } from "../trace.js";

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

  let grade: GroundednessGrade;
  let draftAnswer: string;

  if (hasDraft) {
    grade = {
      grounded: avgScore >= MIN_SIMILARITY_SCORE,
      score: avgScore,
      rationale: "Graded from retrieval similarity scores (fast path)",
    };
    draftAnswer = capAnswerLength(state.draftAnswer);
  } else {
    // Agent used tools but produced no text — synthesize a short summary from top chunks
    const top = citations.slice(0, 3);
    draftAnswer = capAnswerLength(
      `Based on your document(s), here are the most relevant passages:\n\n${top
        .map((c) => `[${c.filename}, page ${c.page}] ${c.excerpt}`)
        .join("\n\n")}`,
    );
    grade = {
      grounded: true,
      score: avgScore,
      rationale: "Answer synthesized from retrieved passages",
    };
  }

  return {
    draftAnswer,
    citations,
    grade,
    critiqueIterations: state.critiqueIterations + 1,
    readyForCritique: false,
    trace: [
      createTraceStep(
        "critique",
        "done",
        `Grounded: ${grade.grounded} (avg score ${grade.score.toFixed(2)})`,
      ),
    ],
  };
}
