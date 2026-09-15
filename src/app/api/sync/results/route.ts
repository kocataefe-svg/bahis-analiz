import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchesAwaitingResult, type MatchAwaitingResult } from "@/lib/db/matches";
import { getMatchResultsByIds, insertMatchResult } from "@/lib/db/match-results";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getScoresForSport } from "@/lib/odds-api";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

export const maxDuration = 30;

// Kullanicinin istegi: mac bittikten 1 saat sonra sonucu kontrol et. Bir
// futbol maci uzatmalarla/duraklamalarla birlikte kickoff'tan ~2 saat
// sonra biter - bu yuzden "mac bitimi" kickoff + 2 saat olarak kabul edilip
// buna 1 saat daha eklenir (toplam kickoff + 3 saat).
const RESULT_CHECK_DELAY_HOURS = 3;
const MAX_MATCHES_PER_RUN = 50;

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const [candidates, leagues] = await Promise.all([
    getMatchesAwaitingResult(supabase, RESULT_CHECK_DELAY_HOURS, MAX_MATCHES_PER_RUN),
    getActiveLeagues(supabase),
  ]);

  const existingResults = await getMatchResultsByIds(
    supabase,
    candidates.map((m) => m.id),
  );
  const pending = candidates.filter((m) => !existingResults.has(m.id));

  const sportKeyByLeagueId = new Map(leagues.map((l) => [l.id, l.oddsApiSportKey]));
  const byLeague = new Map<string, MatchAwaitingResult[]>();
  for (const match of pending) {
    const list = byLeague.get(match.leagueId) ?? [];
    list.push(match);
    byLeague.set(match.leagueId, list);
  }

  let checked = 0;
  let resolved = 0;
  let failed = 0;

  for (const [leagueId, matches] of byLeague) {
    const sportKey = sportKeyByLeagueId.get(leagueId);
    if (!sportKey) continue;

    try {
      const scores = await getScoresForSport(
        sportKey,
        matches.map((m) => m.oddsApiEventId),
      );
      checked += matches.length;

      const matchByEventId = new Map(matches.map((m) => [m.oddsApiEventId, m]));
      for (const score of scores) {
        if (!score.completed || score.homeScore === null || score.awayScore === null) continue;
        const match = matchByEventId.get(score.eventId);
        if (!match) continue;

        await insertMatchResult(supabase, {
          match_id: match.id,
          home_score: score.homeScore,
          away_score: score.awayScore,
        });
        resolved += 1;
      }
    } catch (err) {
      console.error(`Sonuc senkronizasyonu basarisiz: league=${leagueId} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, checked, resolved, failed });
}
