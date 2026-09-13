import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestTeamStats } from "@/lib/db/team-stats";
import { getLatestOdds } from "@/lib/db/odds";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateMatchAnalysis, GEMINI_MODEL } from "@/lib/gemini";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

export const maxDuration = 60;

const ANALYSIS_SYNC_WINDOW_DAYS = 3;
const MAX_MATCHES_PER_RUN = 15;

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const matches = await getUpcomingMatches(supabase, ANALYSIS_SYNC_WINDOW_DAYS, MAX_MATCHES_PER_RUN);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of matches) {
    try {
      const [teamStats, odds, latestAnalysisAt] = await Promise.all([
        getLatestTeamStats(supabase, match.id),
        getLatestOdds(supabase, match.id),
        getLatestAnalysisGeneratedAt(supabase, match.id),
      ]);

      const homeStats = teamStats.find((s) => s.team === "home") ?? null;
      const awayStats = teamStats.find((s) => s.team === "away") ?? null;

      const dataTimestamps = [homeStats?.fetchedAt, awayStats?.fetchedAt, odds[0]?.fetchedAt].filter(
        (v): v is string => Boolean(v),
      );
      const latestDataFetchedAt =
        dataTimestamps.length > 0
          ? dataTimestamps.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
          : null;

      if (!needsFreshAnalysis(latestAnalysisAt, latestDataFetchedAt)) {
        skipped += 1;
        continue;
      }

      const result = await generateMatchAnalysis({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: match.kickoffAt,
        homeStats: homeStats
          ? { form: homeStats.form, injuries: homeStats.injuries, cards: homeStats.cards, lastMatches: homeStats.lastMatches }
          : null,
        awayStats: awayStats
          ? { form: awayStats.form, injuries: awayStats.injuries, cards: awayStats.cards, lastMatches: awayStats.lastMatches }
          : null,
        odds: odds.map((o) => ({ bookmaker: o.bookmaker, outcome: o.outcome, price: o.price })),
      });

      if (!result) {
        failed += 1;
        continue;
      }

      await insertAiAnalysis(supabase, {
        match_id: match.id,
        team_analyst_text: result.teamAnalystText,
        betting_analyst_text: result.bettingAnalystText,
        commentator_text: result.commentatorText,
        summary_text: result.summaryText,
        model_used: GEMINI_MODEL,
      });

      generated += 1;
    } catch (err) {
      console.error(`Analiz senkronizasyonu basarisiz: match=${match.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, generated, skipped, failed });
}
