import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchResultInsertRow {
  match_id: string;
  home_score: number;
  away_score: number;
}

export async function insertMatchResult(supabase: SupabaseClient, row: MatchResultInsertRow): Promise<void> {
  const { error } = await supabase.from("match_results").upsert(row, { onConflict: "match_id" });
  if (error) throw new Error(`Mac sonucu kaydedilemedi: ${error.message}`);
}

export interface MatchResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

export async function getAllMatchResults(supabase: SupabaseClient): Promise<MatchResult[]> {
  const { data, error } = await supabase.from("match_results").select("match_id, home_score, away_score");

  if (error) throw new Error(`Mac sonuclari alinamadi: ${error.message}`);

  interface RawRow {
    match_id: string;
    home_score: number;
    away_score: number;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    matchId: row.match_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
  }));
}

export async function getMatchResultsByIds(
  supabase: SupabaseClient,
  matchIds: string[],
): Promise<Map<string, MatchResult>> {
  if (matchIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("match_results")
    .select("match_id, home_score, away_score")
    .in("match_id", matchIds);

  if (error) throw new Error(`Mac sonuclari alinamadi: ${error.message}`);

  interface RawRow {
    match_id: string;
    home_score: number;
    away_score: number;
  }

  const map = new Map<string, MatchResult>();
  for (const row of (data ?? []) as RawRow[]) {
    map.set(row.match_id, { matchId: row.match_id, homeScore: row.home_score, awayScore: row.away_score });
  }
  return map;
}
