import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventOdds } from "./odds-api";
import { insertOddsSnapshots } from "./db/odds";

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
  // Bilerek bookmaker listesine gore filtrelemiyoruz: totals/btts zaten
  // az sayida sitede mevcut oluyor (h2h gibi 15-20 site degil), tercih
  // edilen siteler bu maci sunmazsa hic veri kalmaz ve her ziyarette
  // bosuna tekrar API cagrisi + kredi harcanir.
  const relevant = quotes.filter((q) => q.market !== "totals" || q.point === TOTALS_POINT);
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
