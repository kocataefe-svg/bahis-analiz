import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchResearchSourceRow {
  url: string;
  title: string;
}

export interface MatchResearchInsertRow {
  match_id: string;
  content: string;
  sources: MatchResearchSourceRow[];
  model_used: string;
}

export async function insertMatchResearch(supabase: SupabaseClient, row: MatchResearchInsertRow): Promise<void> {
  const { error } = await supabase.from("match_research").insert(row);
  if (error) throw new Error(`Arastirma kaydedilemedi: ${error.message}`);
}

export interface MatchResearchRecord {
  content: string;
  sources: MatchResearchSourceRow[];
  modelUsed: string;
  generatedAt: string;
}

export async function getMatchResearch(supabase: SupabaseClient, matchId: string): Promise<MatchResearchRecord | null> {
  const { data, error } = await supabase
    .from("match_research")
    .select("content, sources, model_used, generated_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw new Error(`Arastirma alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as {
    content: string;
    sources: MatchResearchSourceRow[];
    model_used: string;
    generated_at: string;
  };
  return {
    content: row.content,
    sources: row.sources,
    modelUsed: row.model_used,
    generatedAt: row.generated_at,
  };
}
