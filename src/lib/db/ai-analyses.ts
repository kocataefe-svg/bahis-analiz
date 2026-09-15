import type { SupabaseClient } from "@supabase/supabase-js";

export interface AiAnalysisInsertRow {
  match_id: string;
  team_analyst_text: string;
  betting_analyst_text: string;
  commentator_text: string;
  surprise_pick_text: string;
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

export interface LatestAnalysis {
  teamAnalystText: string;
  bettingAnalystText: string;
  commentatorText: string;
  surprisePickText: string;
  summaryText: string;
  modelUsed: string;
  generatedAt: string;
}

export async function getLatestAnalysis(supabase: SupabaseClient, matchId: string): Promise<LatestAnalysis | null> {
  const { data, error } = await supabase
    .from("ai_analyses")
    .select(
      "team_analyst_text, betting_analyst_text, commentator_text, surprise_pick_text, summary_text, model_used, generated_at",
    )
    .eq("match_id", matchId)
    .order("generated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`AI analizi alinamadi: ${error.message}`);

  interface RawRow {
    team_analyst_text: string;
    betting_analyst_text: string;
    commentator_text: string;
    surprise_pick_text: string;
    summary_text: string;
    model_used: string;
    generated_at: string;
  }

  const rows = (data ?? []) as RawRow[];
  const row = rows[0];
  if (!row) return null;

  return {
    teamAnalystText: row.team_analyst_text,
    bettingAnalystText: row.betting_analyst_text,
    commentatorText: row.commentator_text,
    surprisePickText: row.surprise_pick_text,
    summaryText: row.summary_text,
    modelUsed: row.model_used,
    generatedAt: row.generated_at,
  };
}
