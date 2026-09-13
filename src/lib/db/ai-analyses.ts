import type { SupabaseClient } from "@supabase/supabase-js";

export interface AiAnalysisInsertRow {
  match_id: string;
  team_analyst_text: string;
  betting_analyst_text: string;
  commentator_text: string;
  summary_text: string;
  model_used: string;
}

export async function insertAiAnalysis(supabase: SupabaseClient, row: AiAnalysisInsertRow): Promise<void> {
  const { error } = await supabase.from("ai_analyses").insert(row);
  if (error) throw new Error(`AI analizi kaydedilemedi: ${error.message}`);
}

export async function getLatestAnalysisGeneratedAt(supabase: SupabaseClient, matchId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_analyses")
    .select("generated_at")
    .eq("match_id", matchId)
    .order("generated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`AI analizi tarihi alinamadi: ${error.message}`);

  const rows = (data ?? []) as { generated_at: string }[];
  return rows[0]?.generated_at ?? null;
}

export function needsFreshAnalysis(analysisGeneratedAt: string | null, latestDataFetchedAt: string | null): boolean {
  if (!analysisGeneratedAt) return true;
  if (!latestDataFetchedAt) return false;
  return new Date(latestDataFetchedAt).getTime() > new Date(analysisGeneratedAt).getTime();
}
