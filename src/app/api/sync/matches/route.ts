import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches } from "@/lib/db/matches";
import { getUpcomingFixtures } from "@/lib/api-football";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

const SYNC_WINDOW_DAYS = 14;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const leagues = (await getActiveLeagues(supabase)).filter((l) => l.currentSeason != null);

  const fromDate = formatDate(new Date());
  const toDate = formatDate(new Date(Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  let totalUpserted = 0;
  let failed = 0;

  for (const league of leagues) {
    try {
      const fixtures = await getUpcomingFixtures(league.apiFootballId, league.currentSeason as number, fromDate, toDate);

      if (fixtures.length === 0) continue;

      const rows = fixtures.map((f) => ({
        league_id: league.id,
        api_football_fixture_id: f.apiFixtureId,
        home_team: f.homeTeam,
        away_team: f.awayTeam,
        home_team_api_id: f.homeTeamApiId,
        away_team_api_id: f.awayTeamApiId,
        kickoff_at: f.kickoffAt,
      }));

      await upsertMatches(supabase, rows);
      totalUpserted += rows.length;
    } catch (err) {
      console.error(`Mac senkronizasyonu basarisiz: league=${league.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, totalUpserted, failed });
}
