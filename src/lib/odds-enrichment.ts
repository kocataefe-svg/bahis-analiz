import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventOdds } from "./odds-api";
import { insertOddsSnapshots } from "./db/odds";
import { limitBookmakersPerMarket } from "./display-bookmakers";

const EXTRA_MARKETS = ["totals", "btts"] as const;
const TOTALS_POINT = 2.5;

/**
 * Bir mac icin KG var/yok (btts) ve 2.5 ust/alt (totals) oranlari sadece
 * kimse o macin detay sayfasini actiginda, eksik olan marketler icin, tek
 * seferlik cekilir ve kalici olarak odds_snapshots'a yazilir. Boylece
 * gunluk toplu sync butceye (500 kredi/ay) dokunmaz - maliyet sadece
 * gercekten goruntulenen maclarla sinirli kalir.
 */
export async function ensureExtraMarketsOdds(
  supabase: SupabaseClient,
  matchId: string,
  oddsApiEventId: string,
  sportKey: string,
  existingMarkets: Set<string>,
): Promise<boolean> {
  const missing = EXTRA_MARKETS.filter((m) => !existingMarkets.has(m));
  if (missing.length === 0) return false;

  const quotes = await getEventOdds(sportKey, oddsApiEventId, missing.join(","));
  const withCorrectPoint = quotes.filter((q) => q.market !== "totals" || q.point === TOTALS_POINT);
  // limitBookmakersPerMarket tercih edilen siteleri dener, o pazarda hicbiri
  // yoksa mevcut herhangi bir siteye duser - bu yuzden bir pazar asla
  // tamamen bos kalip her ziyarette tekrar API cagrisina yol acmaz.
  const relevant = limitBookmakersPerMarket(withCorrectPoint);
  if (relevant.length === 0) return false;

  await insertOddsSnapshots(
    supabase,
    relevant.map((q) => ({
      match_id: matchId,
      market: q.market,
      outcome: q.point !== undefined ? `${q.outcome} ${q.point}` : q.outcome,
      bookmaker: q.bookmaker,
      price: q.price,
    })),
  );
  return true;
}
