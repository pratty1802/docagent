/**
 * Pick which retrieval hits to surface as UI citations.
 *
 * LEARNING: Top-k retrieval often returns weakly related chunks from other
 * docs. Prefer passages the answer actually cites; otherwise keep only the
 * strongest cluster. Hide citations when the answer refuses / is ungrounded.
 */
import { NO_CONTEXT_MESSAGE } from "../guardrails/prompts.js";
import type { Citation } from "../types.js";

const REFUSAL_RE =
  /could not find|no relevant|not (found|available) in (your |the )?documents|insufficient (context|information)/i;

const MAX_CITATIONS = 3;

function basename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, "").toLowerCase();
}

function answerMentionsFile(answer: string, filename: string): boolean {
  const lower = answer.toLowerCase();
  const full = filename.toLowerCase();
  const base = basename(filename);
  if (full.length >= 4 && lower.includes(full)) return true;
  // Match "report.pdf" or "report" as a token / Sources entry
  if (base.length < 3) return false;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:\\.[a-z0-9]+)?(?:[^a-z0-9]|$)`, "i").test(
    answer,
  );
}

function pagesNearMention(answer: string, filename: string): Set<number> | null {
  const lower = answer.toLowerCase();
  const full = filename.toLowerCase();
  const base = basename(filename);
  const idx = Math.max(
    lower.indexOf(full),
    base.length >= 3 ? lower.indexOf(base) : -1,
  );
  if (idx < 0) return null;

  const window = answer.slice(Math.max(0, idx - 40), idx + filename.length + 80);
  const pages = new Set<number>();
  for (const m of window.matchAll(
    /\b(?:p(?:age)?\.?\s*|pages?\s+)(\d+)(?:\s*[-–—]\s*(\d+))?/gi,
  )) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (!Number.isFinite(a)) continue;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) pages.add(p);
  }
  return pages.size > 0 ? pages : null;
}

function dedupeByDocPage(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = `${c.documentId}:${c.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Strong cluster around the best hit — drops trailing weak / off-topic docs. */
function strongCluster(citations: Citation[]): Citation[] {
  if (citations.length === 0) return [];
  const sorted = [...citations].sort((a, b) => b.score - a.score);
  const top = sorted[0]!.score;
  const floor = Math.max(top - 0.08, top * 0.88);
  return sorted.filter((c) => c.score >= floor);
}

export function selectAnswerCitations(
  answer: string,
  citations: Citation[],
  options: { grounded?: boolean } = {},
): Citation[] {
  if (citations.length === 0) return [];

  const trimmed = answer.trim();
  if (
    !trimmed ||
    trimmed === NO_CONTEXT_MESSAGE ||
    REFUSAL_RE.test(trimmed) ||
    options.grounded === false
  ) {
    return [];
  }

  const mentioned = citations.filter((c) => answerMentionsFile(trimmed, c.filename));
  if (mentioned.length > 0) {
    const pageFiltered = mentioned.filter((c) => {
      const pages = pagesNearMention(trimmed, c.filename);
      return !pages || pages.has(c.page);
    });
    const pool = pageFiltered.length > 0 ? pageFiltered : mentioned;
    return dedupeByDocPage(pool).slice(0, MAX_CITATIONS);
  }

  // Answer didn't name files — keep only the top similarity cluster.
  return dedupeByDocPage(strongCluster(citations)).slice(0, MAX_CITATIONS);
}
