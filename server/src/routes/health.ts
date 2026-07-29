import { Router } from "express";
import { pingSupabase } from "../lib/supabase.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const supabaseOk = await pingSupabase();
  res.json({
    status: supabaseOk ? "ok" : "degraded",
    supabase: supabaseOk,
    timestamp: new Date().toISOString(),
  });
});
