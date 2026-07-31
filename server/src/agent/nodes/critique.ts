/**
 * Critique node — groundedness from LLM confidence score.
 *
 * LEARNING: The grader returns grounded + score; we surface that score directly
 * (no retrieval blend). Retrieval still gates empty/weak hits. Bounded by
 * MAX_CRITIQUE_RETRIES. See LEARNING.md § Critique loop.
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

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function llmGrade(
  question: string,
  answer: string,
  context: string,
): Promise<GroundednessGrade | null> {
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
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<GroundednessGrade>;
    if (typeof parsed.grounded !== "boolean") return null;

    const score = clamp01(Number(parsed.score));
    return {
      grounded: parsed.grounded,
      // Trust the LLM confidence score directly (clamped).
      // Fallback only when the model omitted a numeric score.
      score: Number.isFinite(Number(parsed.score))
        ? score
        : parsed.grounded
          ? 0.7
          : 0.3,
      rationale: parsed.rationale || "LLM critique",
    };
  } catch {
    return null;
  }
}

export async function critiqueNode(state: AgentStateType) {
  const { MIN_SIMILARITY_SCORE } = getConfig();
  const hits = await searchDocuments(state.question, {
    documentIds: state.documentIds.length > 0 ? state.documentIds : undefined,
    minScore: MIN_SIMILARITY_SCORE,
    // Same query the agent used; skip a second rewrite to save quota / stay consistent
    rewrite: false,
  });

  // Short excerpts for UI; fuller text for the LLM grader.
  const citations: Citation[] = hits.map((h) => ({
    documentId: h.documentId,
    filename: h.filename,
    page: h.page,
    chunkId: h.id,
    excerpt: h.content.slice(0, 280),
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

  const topScore = Math.max(...citations.map((c) => c.score));
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

  // Retrieval floor only — if nothing cleared the threshold, skip LLM grade.
  if (topScore < MIN_SIMILARITY_SCORE) {
    return {
      draftAnswer,
      citations,
      grade: {
        grounded: false,
        score: topScore,
        rationale: "Retrieval similarity below threshold",
      },
      critiqueIterations: state.critiqueIterations + 1,
      readyForCritique: false,
      trace: [
        createTraceStep(
          "critique",
          "done",
          `Weak retrieval (top ${topScore.toFixed(2)}) — retry`,
        ),
      ],
    };
  }

  // Grade against fuller chunk text (UI excerpts stay short).
  const gradeContext = hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.filename} p.${h.page}\n${h.content.slice(0, 1500)}`,
    )
    .join("\n\n");

  let grade: GroundednessGrade;
  try {
    const graded = await llmGrade(state.question, draftAnswer, gradeContext);
    grade =
      graded ??
      ({
        grounded: true,
        score: topScore,
        rationale: "Could not parse critique JSON — used retrieval similarity",
      } satisfies GroundednessGrade);
  } catch {
    grade = {
      grounded: true,
      score: topScore,
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
        `Grounded: ${grade.grounded} (confidence ${grade.score.toFixed(2)}) — ${grade.rationale}`,
      ),
    ],
  };
}
