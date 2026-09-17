"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient, type SupabaseClient } from "@/lib/supabase";
import { getMatchById, type MatchDetail } from "@/lib/db/matches";
import { getMatchResearch, insertMatchResearch } from "@/lib/db/match-research";
import { getLatestOdds } from "@/lib/db/odds";
import { insertAiAnalysis } from "@/lib/db/ai-analyses";
import { researchMatchContext, RESEARCH_MODEL } from "@/lib/web-research";
import { generateFullAnalysis } from "@/lib/analysis-orchestrator";

export interface ResearchMatchState {
  error: string | null;
  quotaExhausted: boolean;
}

export async function researchMatch(matchId: string, _prevState: ResearchMatchState): Promise<ResearchMatchState> {
  const supabase = getSupabaseClient();

  const existing = await getMatchResearch(supabase, matchId);
  if (existing) {
    return { error: null, quotaExhausted: false };
  }

  const match = await getMatchById(supabase, matchId);
  if (!match) {
    return { error: "Mac bulunamadi.", quotaExhausted: false };
  }

  const result = await researchMatchContext({
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt,
  });

  if ("reason" in result) {
    if (result.reason === "quota") {
      return { error: "Gunluk arama kotasi doldu, birkac saat sonra tekrar deneyin.", quotaExhausted: true };
    }
    return { error: "Arastirma basarisiz, tekrar deneyin.", quotaExhausted: false };
  }

  try {
    await insertMatchResearch(supabase, {
      match_id: matchId,
      content: result.content,
      sources: result.sources,
      model_used: RESEARCH_MODEL,
    });
  } catch {
    return { error: "Arastirma kaydedilemedi, tekrar deneyin.", quotaExhausted: false };
  }

  // Arastirma sonucu artik mevcut - kullanicinin ayni ziyarette guncel
  // yorum gormesi icin AI analizini hemen bu veriyle yeniden uretiyoruz
  // (gunluk cron'u beklemek yerine). Basarisiz olursa arastirma sonucu
  // yine de kaydedilmis olur; analiz bir sonraki cron'da yenilenir.
  await regenerateAnalysisWithResearch(supabase, match, result.content);

  revalidatePath("/matches/[id]", "page");
  return { error: null, quotaExhausted: false };
}

async function regenerateAnalysisWithResearch(
  supabase: SupabaseClient,
  match: MatchDetail,
  researchContext: string,
): Promise<void> {
  try {
    const odds = await getLatestOdds(supabase, match.id);
    const analysis = await generateFullAnalysis({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffAt: match.kickoffAt,
      researchContext,
      odds: odds.map((o) => ({ market: o.market, bookmaker: o.bookmaker, outcome: o.outcome, price: o.price })),
    });
    if (!analysis) return;

    await insertAiAnalysis(supabase, { match_id: match.id, ...analysis });
  } catch (err) {
    console.warn(`Arastirma sonrasi analiz yenileme basarisiz: match=${match.id} ->`, err);
  }
}
