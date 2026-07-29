/**
 * Lightweight eval suite for DocAgent retrieval + chat quality.
 *
 * Usage:
 *   npm run eval
 *
 * LEARNING: Automated evals catch regressions when you change chunking,
 * prompts, or models. Keep fixtures small for free-tier Gemini quotas.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { searchDocuments } from "../src/rag/store.js";
import { runAgent } from "../src/agent/run.js";
import { getConfig } from "../src/config.js";
import fixtures from "./fixtures.json" with { type: "json" };

loadEnv({ path: resolve(process.cwd(), "../.env") });
loadEnv();

type Fixture = {
  id: string;
  question: string;
  expectKeywords: string[];
  expectCitation: boolean;
};

type Row = {
  id: string;
  retrievalHit: boolean;
  citationOk: boolean;
  keywordHit: boolean;
  latencyMs: number;
  answerPreview: string;
};

async function evalOne(fx: Fixture): Promise<Row> {
  const started = Date.now();

  const hits = await searchDocuments(fx.question, { topK: 5 });
  const retrievalHit = hits.length > 0;

  const chat = await runAgent(fx.question);
  const latencyMs = Date.now() - started;

  const answerLower = chat.answer.toLowerCase();
  const keywordHit =
    fx.expectKeywords.length === 0 ||
    fx.expectKeywords.some((k) => answerLower.includes(k.toLowerCase()));

  const citationOk = !fx.expectCitation || chat.citations.length > 0;

  return {
    id: fx.id,
    retrievalHit,
    citationOk,
    keywordHit,
    latencyMs,
    answerPreview: chat.answer.slice(0, 120).replace(/\s+/g, " "),
  };
}

async function main() {
  // Validate env early
  getConfig();

  const cases = fixtures as Fixture[];
  console.log(`Running ${cases.length} eval cases…\n`);

  const rows: Row[] = [];
  for (const fx of cases) {
    try {
      const row = await evalOne(fx);
      rows.push(row);
      const ok =
        row.retrievalHit && row.citationOk && row.keywordHit ? "PASS" : "FAIL";
      console.log(
        `[${ok}] ${fx.id} (${row.latencyMs}ms) retrieval=${row.retrievalHit} cite=${row.citationOk} keywords=${row.keywordHit}`,
      );
      console.log(`       ${row.answerPreview}…\n`);
    } catch (err) {
      console.error(`[ERROR] ${fx.id}`, err instanceof Error ? err.message : err);
      rows.push({
        id: fx.id,
        retrievalHit: false,
        citationOk: false,
        keywordHit: false,
        latencyMs: 0,
        answerPreview: "error",
      });
    }
  }

  const pass = rows.filter(
    (r) => r.retrievalHit && r.citationOk && r.keywordHit,
  ).length;
  const avgLatency =
    rows.reduce((s, r) => s + r.latencyMs, 0) / Math.max(rows.length, 1);

  console.log("─".repeat(48));
  console.log(
    `Score: ${pass}/${rows.length} (${((pass / rows.length) * 100).toFixed(0)}%)`,
  );
  console.log(`Avg latency: ${avgLatency.toFixed(0)}ms`);
  console.log(
    "Note: evals need uploaded PDFs whose content matches fixtures.expectKeywords.",
  );

  if (pass < rows.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
