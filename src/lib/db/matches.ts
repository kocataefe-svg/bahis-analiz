import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchUpsertRow {
  league_id: string;
  odds_api_event_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
}

export interface UpsertedMatch {
  id: string;
  oddsApiEventId: string;
}

export async function upsertMatches(supabase: SupabaseClient, rows: MatchUpsertRow[]): Promise<UpsertedMatch[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from("matches")
    .upsert(rows, { onConflict: "odds_api_event_id" })
    .select("id, odds_api_event_id");
  if (error) throw new Error(`Maclar kaydedilemedi: ${error.message}`);

  interface RawRow {
    id: string;
    odds_api_event_id: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    oddsApiEventId: row.odds_api_event_id,
  }));
}

export interface SyncMatch {
  id: string;
  leagueId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  oddsApiEventId: string;
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
    .select("id, league_id, home_team, away_team, kickoff_at, odds_api_event_id")
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", untilIso)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Yaklasan maclar alinamadi: ${error.message}`);

  interface RawMatchRow {
    id: string;
    league_id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    odds_api_event_id: string;
  }

  return ((data ?? []) as RawMatchRow[]).map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
    oddsApiEventId: row.odds_api_event_id,
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

export interface MatchDetail extends DisplayMatch {
  oddsApiEventId: string;
}

export async function getMatchById(supabase: SupabaseClient, id: string): Promise<MatchDetail | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, league_id, home_team, away_team, kickoff_at, odds_api_event_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Mac alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as {
    id: string;
    league_id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    odds_api_event_id: string;
  };
  return {
    id: row.id,
    leagueId: row.league_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
    oddsApiEventId: row.odds_api_event_id,
  };
}
