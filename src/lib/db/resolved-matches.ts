import type { SupabaseClient } from "@supabase/supabase-js";
import { getAllMatchResults } from "./match-results";
import { getMatchTeamsByIds } from "./matches";
import { getLatestAnalysesByMatchIds } from "./ai-analyses";
import type { ResolvedMatchForStats } from "../persona-stats";

/**
 * Istatistik sayfasi icin: sonucu belli her mac icin takim adlarini ve o
 * macin en son AI analiz picklerini bir araya getirir. computePersonaStats
 * bunun uzerinden calisir.
 */
export async function getResolvedMatchesForStats(supabase: SupabaseClient): Promise<ResolvedMatchForStats[]> {
  const results = await getAllMatchResults(supabase);
  if (results.length === 0) return [];

  const matchIds = results.map((r) => r.matchId);
  const [teamsByMatchId, analysesByMatchId] = await Promise.all([
    getMatchTeamsByIds(supabase, matchIds),
    getLatestAnalysesByMatchIds(supabase, matchIds),
  ]);

  const resolved: ResolvedMatchForStats[] = [];
  for (const result of results) {
    const teams = teamsByMatchId.get(result.matchId);
    if (!teams) continue;
    const analysis = analysesByMatchId.get(result.matchId);

    resolved.push({
      homeTeam: teams.homeTeam,
      awayTeam: teams.awayTeam,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      teamAnalystPick: analysis?.teamAnalystPick ?? null,
      commentatorPick: analysis?.commentatorPick ?? null,
      bettingAnalystPick: analysis?.bettingAnalystPick ?? null,
      surpriseComboPick: analysis?.surpriseComboPick ?? null,
    });
  }
  return resolved;
}
