import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestOdds } from "@/lib/db/odds";
import { getMatchResearch, insertMatchResearch } from "@/lib/db/match-research";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateFullAnalysis } from "@/lib/analysis-orchestrator";
import { ensureExtraMarketsOdds } from "@/lib/odds-enrichment";
import { researchMatchContext, RESEARCH_MODEL } from "@/lib/web-research";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

export const maxDuration = 60;

const ANALYSIS_SYNC_WINDOW_DAYS = 3;
// 15'ten dusuruldu (2026-09-15): her mac artik hem 7 pazarlik zenginlestirme
// (Odds API round-trip) hem Groq cagrisi (bazen 429 sonrasi ~8sn'ye kadar
// retry beklemesi) icerebiliyor - 15 mac canli ortamda 60sn'lik
// maxDuration'i asip timeout'a neden oldu. Kapsanamayan maclar zaten
// needsFreshAnalysis sayesinde bir sonraki cron'da tekrar denenir.
const MAX_MATCHES_PER_RUN = 8;

// Arastirma (Tavily web aramasi, bkz. web-research.ts) kotasi paylasimli ve
// aylik sinirli - bir calismada cok fazla mac icin denemek kotayi tek
// seferde tuketip diger kullanicilarin manuel Arastir butonunu da
// bloke edebilir. Sadece o gun
// oynanacak maclara oncelik verilir (2026-09-15: hafta sonu yogunlasan
// mac trafiginde 3 gunluk pencerenin tamamini arastirmaya calismak yerine
// her mac kendi gununde arastirilir - hem kota patlamasini hem 60sn
// maxDuration asimini onler).
const MAX_RESEARCH_PER_RUN = 6;

function isMatchToday(kickoffAtIso: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });
  return fmt.format(new Date(kickoffAtIso)) === fmt.format(new Date());
}

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const [matches, leagues] = await Promise.all([
    getUpcomingMatches(supabase, ANALYSIS_SYNC_WINDOW_DAYS, MAX_MATCHES_PER_RUN),
    getActiveLeagues(supabase),
  ]);
  const sportKeyByLeagueId = new Map(leagues.map((l) => [l.id, l.oddsApiSportKey]));

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let researchRemaining = MAX_RESEARCH_PER_RUN;

  for (const match of matches) {
    try {
      let odds = await getLatestOdds(supabase, match.id);

      // Yorumcularin KG/2.5 hakkinda "veri yok" demek zorunda kalmamasi icin,
      // analiz uretmeden once bu macin eksik pazarlarini (varsa) tek seferlik
      // tamamlamaya calis - zaten kalici cache'lendigi icin ayni maca tekrar
      // API cagrisi yapilmaz.
      const sportKey = sportKeyByLeagueId.get(match.leagueId);
      if (sportKey) {
        const existingMarkets = new Set(odds.map((o) => o.market));
        const insertedNew = await ensureExtraMarketsOdds(
          supabase,
          match.id,
          match.oddsApiEventId,
          sportKey,
          existingMarkets,
        );
        if (insertedNew) {
          odds = await getLatestOdds(supabase, match.id);
        }
      }

      const [latestAnalysisAt, research] = await Promise.all([
        getLatestAnalysisGeneratedAt(supabase, match.id),
        getMatchResearch(supabase, match.id),
      ]);

      const latestDataFetchedAt = odds[0]?.fetchedAt ?? null;

      if (!needsFreshAnalysis(latestAnalysisAt, latestDataFetchedAt)) {
        skipped += 1;
        continue;
      }

      // Arastirma yoksa ve mac bugun oynanacaksa, analiz uretmeden once
      // otomatik arastirma dene - boylece cogu mac, kullanici manuel Arastir
      // basmasa bile araştirma-destekli analiz alir. Kota bitince bu
      // calismadaki diger denemeler atlanir, analiz oran-bazli devam eder.
      let researchContext = research?.content ?? null;
      if (!research && researchRemaining > 0 && isMatchToday(match.kickoffAt)) {
        researchRemaining -= 1;
        const outcome = await researchMatchContext({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          kickoffAt: match.kickoffAt,
        });
        if ("reason" in outcome) {
          if (outcome.reason === "quota") researchRemaining = 0;
        } else {
          await insertMatchResearch(supabase, {
            match_id: match.id,
            content: outcome.content,
            sources: outcome.sources,
            model_used: RESEARCH_MODEL,
          });
          researchContext = outcome.content;
        }
      }

      const result = await generateFullAnalysis({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: match.kickoffAt,
        researchContext,
        odds: odds.map((o) => ({ market: o.market, bookmaker: o.bookmaker, outcome: o.outcome, price: o.price })),
      });

      if (!result) {
        failed += 1;
        continue;
      }

      await insertAiAnalysis(supabase, { match_id: match.id, ...result });

      generated += 1;
    } catch (err) {
      console.error(`Analiz senkronizasyonu basarisiz: match=${match.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, generated, skipped, failed });
}
