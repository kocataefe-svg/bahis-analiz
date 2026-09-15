import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches, type MatchUpsertRow } from "@/lib/db/matches";
import { insertOddsSnapshots } from "@/lib/db/odds";
import { getOddsForSport } from "@/lib/odds-api";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";
import { limitBookmakersPerMarket } from "@/lib/display-bookmakers";

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const leagues = (await getActiveLeagues(supabase)).filter((l) => l.oddsApiSportKey);

  let totalMatchesUpserted = 0;
  let totalOddsInserted = 0;
  let failed = 0;

  for (const league of leagues) {
    try {
      const quotes = await getOddsForSport(league.oddsApiSportKey as string);
      if (quotes.length === 0) continue;

      const matchRowsByEventId = new Map<string, MatchUpsertRow>();
      for (const quote of quotes) {
        if (!matchRowsByEventId.has(quote.eventId)) {
          matchRowsByEventId.set(quote.eventId, {
            league_id: league.id,
            odds_api_event_id: quote.eventId,
            home_team: quote.homeTeam,
            away_team: quote.awayTeam,
            kickoff_at: quote.commenceTime,
          });
        }
      }

      const upserted = await upsertMatches(supabase, Array.from(matchRowsByEventId.values()));
      totalMatchesUpserted += upserted.length;

      const matchIdByEventId = new Map(upserted.map((m) => [m.oddsApiEventId, m.id]));
      // Fikstur olusturma TUM quotes'u kullanir (hangi bookmaker'da olursa
      // olsun bir mac varsa eklenmeli); oran kaydinda ise her maca ozel
      // pazar bazinda en fazla iki siteye indirgenir.
      const oddsRows = limitBookmakersPerMarket(quotes)
        .map((quote) => {
          const matchId = matchIdByEventId.get(quote.eventId);
          if (!matchId) return null;
          return {
            match_id: matchId,
            market: quote.market,
            outcome: quote.outcome,
            bookmaker: quote.bookmaker,
            price: quote.price,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      await insertOddsSnapshots(supabase, oddsRows);
      totalOddsInserted += oddsRows.length;
    } catch (err) {
      console.error(`Oran senkronizasyonu basarisiz: league=${league.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, totalMatchesUpserted, totalOddsInserted, failed });
}
