/**
 * Supabase client (service role — server only).
 *
 * LEARNING: The service role bypasses RLS for our v1 demo. Never expose this
 * key in the React app or VITE_* env vars. See LEARNING.md § Database security.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../config.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getConfig();
  client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function pingSupabase(): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from("documents").select("id").limit(1);
  return !error;
}
