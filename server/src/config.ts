/**
 * Environment configuration validated at boot with Zod.
 *
 * LEARNING: Fail-fast validation prevents misconfigured deploys from serving
 * traffic with missing API keys or invalid limits. See LEARNING.md § Configuration.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadEnv({ path: resolve(process.cwd(), "../.env") });
loadEnv();

/** Trim + strip accidental models/ prefix from Gemini model IDs. */
const modelId = z
  .string()
  .transform((v) => v.trim().replace(/^models\//, ""))
  .pipe(z.string().min(1));

const envSchema = z.object({
  GOOGLE_API_KEY: z.string().trim().min(1),
  SUPABASE_URL: z.string().trim().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GEMINI_CHAT_MODEL: modelId.default("gemini-2.5-flash"),
  GEMINI_EMBED_MODEL: modelId.default("gemini-embedding-001"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),
  MAX_QUESTION_LENGTH: z.coerce.number().int().positive().default(2000),
  MAX_DOCUMENT_IDS: z.coerce.number().int().positive().default(10),
  MAX_AGENT_ITERATIONS: z.coerce.number().int().positive().default(5),
  MAX_CRITIQUE_RETRIES: z.coerce.number().int().positive().default(2),
  MIN_SIMILARITY_SCORE: z.coerce.number().min(0).max(1).default(0.35),
  MAX_ANSWER_LENGTH: z.coerce.number().int().positive().default(4000),
  MAX_PAGES_PER_DOC: z.coerce.number().int().positive().default(100),
  MAX_CHUNKS_PER_DOC: z.coerce.number().int().positive().default(200),
  LLM_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  EMBED_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  SEARCH_TOP_K: z.coerce.number().int().positive().default(5),
  SEARCH_CANDIDATE_K: z.coerce.number().int().positive().default(12),
  HYBRID_ALPHA: z.coerce.number().min(0).max(1).default(0.7),
  RATE_LIMIT_CHAT: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_UPLOAD: z.coerce.number().int().positive().default(10),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function getCorsOrigins(): string[] {
  const { CORS_ORIGIN } = getConfig();
  return CORS_ORIGIN.split(",").map((o: string) => o.trim()).filter(Boolean);
}
