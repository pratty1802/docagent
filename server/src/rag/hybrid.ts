/**
 * Keyword / lexical boost for hybrid retrieval.
 *
 * LEARNING: Dense vectors miss exact IDs and rare terms; a simple term overlap
 * boost improves hybrid RAG without a full BM25 engine.
 */
export function keywordOverlapScore(query: string, content: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;

  const hay = content.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (hay.includes(term)) hits += 1;
  }
  return hits / terms.length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Merge vector score with lexical overlap (0–1).
 * alpha weights dense similarity; (1-alpha) weights keywords.
 */
export function hybridScore(
  vectorScore: number,
  lexicalScore: number,
  alpha = 0.7,
): number {
  return alpha * vectorScore + (1 - alpha) * lexicalScore;
}
