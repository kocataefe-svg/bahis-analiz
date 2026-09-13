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

export interface LatestTeamStats {
  team: "home" | "away";
  form: string | null;
  injuries: unknown[];
  cards: unknown[];
  lastMatches: unknown[];
  fetchedAt: string;
}

export async function getLatestTeamStats(supabase: SupabaseClient, matchId: string): Promise<LatestTeamStats[]> {
  const { data, error } = await supabase
    .from("team_stats_snapshots")
    .select("team, form, injuries, cards, last_matches, fetched_at")
    .eq("match_id", matchId)
    .order("fetched_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`Takim istatistikleri alinamadi: ${error.message}`);

  interface RawRow {
    team: "home" | "away";
    form: string | null;
    injuries: unknown[];
    cards: unknown[];
    last_matches: unknown[];
    fetched_at: string;
  }

  const seenTeams = new Set<string>();
  const latest: LatestTeamStats[] = [];
  for (const row of (data ?? []) as RawRow[]) {
    if (seenTeams.has(row.team)) continue;
    seenTeams.add(row.team);
    latest.push({
      team: row.team,
      form: row.form,
      injuries: row.injuries,
      cards: row.cards,
      lastMatches: row.last_matches,
      fetchedAt: row.fetched_at,
    });
  }
  return latest;
}
