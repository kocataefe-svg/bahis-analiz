import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertTeamStatsSnapshot } from "@/lib/db/team-stats";
import { getRecentFixtures, getInjuriesForFixture } from "@/lib/api-football";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

const STATS_SYNC_WINDOW_DAYS = 3;
const MAX_MATCHES_PER_RUN = 15;
const RECENT_FIXTURES_COUNT = 5;

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const matches = await getUpcomingMatches(supabase, STATS_SYNC_WINDOW_DAYS, MAX_MATCHES_PER_RUN);

  let processed = 0;
  let failed = 0;
  for (const match of matches) {
    try {
      const [homeRecent, awayRecent, injuries] = await Promise.all([
        getRecentFixtures(match.homeTeamApiId, RECENT_FIXTURES_COUNT),
        getRecentFixtures(match.awayTeamApiId, RECENT_FIXTURES_COUNT),
        getInjuriesForFixture(match.apiFixtureId),
      ]);

      const injuriesArray = injuries as { team?: { id?: number } }[];

      await insertTeamStatsSnapshot(supabase, {
        match_id: match.id,
        team: "home",
        form: homeRecent.map((f) => f.result).join(""),
        injuries: injuriesArray.filter((inj) => inj?.team?.id === match.homeTeamApiId),
        last_matches: homeRecent,
      });

      await insertTeamStatsSnapshot(supabase, {
        match_id: match.id,
        team: "away",
        form: awayRecent.map((f) => f.result).join(""),
        injuries: injuriesArray.filter((inj) => inj?.team?.id === match.awayTeamApiId),
        last_matches: awayRecent,
      });

      processed += 1;
    } catch (err) {
      console.error(`Istatistik senkronizasyonu basarisiz: match=${match.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, processed, failed });
}
