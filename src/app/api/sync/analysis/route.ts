import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestOdds } from "@/lib/db/odds";
import { getMatchResearch } from "@/lib/db/match-research";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateMatchAnalysis, GROQ_MODEL } from "@/lib/groq";
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
      const [odds, latestAnalysisAt, research] = await Promise.all([
        getLatestOdds(supabase, match.id),
        getLatestAnalysisGeneratedAt(supabase, match.id),
        getMatchResearch(supabase, match.id),
      ]);

      const latestDataFetchedAt = odds[0]?.fetchedAt ?? null;

      if (!needsFreshAnalysis(latestAnalysisAt, latestDataFetchedAt)) {
        skipped += 1;
        continue;
      }

      const result = await generateMatchAnalysis({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: match.kickoffAt,
        researchContext: research?.content ?? null,
        odds: odds.map((o) => ({ market: o.market, bookmaker: o.bookmaker, outcome: o.outcome, price: o.price })),
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
        model_used: GROQ_MODEL,
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
