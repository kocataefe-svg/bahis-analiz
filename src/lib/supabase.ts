import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY env degiskeni tanimli degil");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
