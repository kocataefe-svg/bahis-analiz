import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertOddsSnapshots } from "@/lib/db/odds";
import { getOddsForSport } from "@/lib/odds-api";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

const ODDS_SYNC_WINDOW_DAYS = 14;
const MAX_MATCHES_TO_MATCH_AGAINST = 200;

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const leagues = (await getActiveLeagues(supabase)).filter((l) => l.oddsApiSportKey);
  const matches = await getUpcomingMatches(supabase, ODDS_SYNC_WINDOW_DAYS, MAX_MATCHES_TO_MATCH_AGAINST);

  let totalInserted = 0;
  let totalUnmatched = 0;

  for (const league of leagues) {
    const quotes = await getOddsForSport(league.oddsApiSportKey as string);
    const rows = [];

    for (const quote of quotes) {
      const match = matches.find(
        (m) =>
          normalizeTeamName(m.homeTeam) === normalizeTeamName(quote.homeTeam) &&
          normalizeTeamName(m.awayTeam) === normalizeTeamName(quote.awayTeam),
      );

      if (!match) {
        totalUnmatched += 1;
        continue;
      }

      rows.push({
        match_id: match.id,
        market: quote.market,
        outcome: quote.outcome,
        bookmaker: quote.bookmaker,
        price: quote.price,
      });
    }

    await insertOddsSnapshots(supabase, rows);
    totalInserted += rows.length;
  }

  return NextResponse.json({ ok: true, totalInserted, totalUnmatched });
}
