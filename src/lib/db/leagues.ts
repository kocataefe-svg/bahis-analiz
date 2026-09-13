import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncLeague {
  id: string;
  apiFootballId: number;
  currentSeason: number | null;
  oddsApiSportKey: string | null;
}

export async function getActiveLeagues(supabase: SupabaseClient): Promise<SyncLeague[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, api_football_id, current_season, odds_api_sport_key")
    .eq("active", true);

  if (error) throw new Error(`Ligler alinamadi: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    apiFootballId: row.api_football_id,
    currentSeason: row.current_season,
    oddsApiSportKey: row.odds_api_sport_key,
  }));
}
