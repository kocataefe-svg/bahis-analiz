import type { SupabaseClient } from "@supabase/supabase-js";

export interface TeamStatsInsertRow {
  match_id: string;
  team: "home" | "away";
  form: string | null;
  injuries: unknown[];
  last_matches: unknown[];
}

export async function insertTeamStatsSnapshot(supabase: SupabaseClient, row: TeamStatsInsertRow): Promise<void> {
  const { error } = await supabase.from("team_stats_snapshots").insert(row);
  if (error) throw new Error(`Takim istatistigi kaydedilemedi: ${error.message}`);
}
