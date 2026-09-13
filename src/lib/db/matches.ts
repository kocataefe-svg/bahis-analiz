import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchUpsertRow {
  league_id: string;
  api_football_fixture_id: number;
  home_team: string;
  away_team: string;
  home_team_api_id: number;
  away_team_api_id: number;
  kickoff_at: string;
}

export async function upsertMatches(supabase: SupabaseClient, rows: MatchUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("matches").upsert(rows, { onConflict: "api_football_fixture_id" });
  if (error) throw new Error(`Maclar kaydedilemedi: ${error.message}`);
}

export interface SyncMatch {
  id: string;
  apiFixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamApiId: number;
  awayTeamApiId: number;
  kickoffAt: string;
}

export async function getUpcomingMatches(
  supabase: SupabaseClient,
  withinDays: number,
  limit: number,
): Promise<SyncMatch[]> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("matches")
    .select("id, api_football_fixture_id, home_team, away_team, home_team_api_id, away_team_api_id, kickoff_at")
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", untilIso)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Yaklasan maclar alinamadi: ${error.message}`);

  interface RawMatchRow {
    id: string;
    api_football_fixture_id: number;
    home_team: string;
    away_team: string;
    home_team_api_id: number;
    away_team_api_id: number;
    kickoff_at: string;
  }

  return ((data ?? []) as RawMatchRow[]).map((row) => ({
    id: row.id,
    apiFixtureId: row.api_football_fixture_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeTeamApiId: row.home_team_api_id,
    awayTeamApiId: row.away_team_api_id,
    kickoffAt: row.kickoff_at,
  }));
}

export interface DisplayMatch {
  id: string;
  leagueId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
}

export async function getUpcomingMatchesWithLeague(
  supabase: SupabaseClient,
  withinDays: number,
  limit: number,
): Promise<DisplayMatch[]> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("matches")
    .select("id, league_id, home_team, away_team, kickoff_at")
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", untilIso)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Yaklasan maclar alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    league_id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
  }));
}

export async function getMatchById(supabase: SupabaseClient, id: string): Promise<DisplayMatch | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, league_id, home_team, away_team, kickoff_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Mac alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; league_id: string; home_team: string; away_team: string; kickoff_at: string };
  return {
    id: row.id,
    leagueId: row.league_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
  };
}
