import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventOdds, type OddsQuote } from "./odds-api";
import { insertOddsSnapshots } from "./db/odds";
import { limitBookmakersPerMarket } from "./display-bookmakers";

const EXTRA_MARKETS = [
  "totals",
  "btts",
  "h2h_h1",
  "totals_h1",
  "btts_h1",
  "spreads",
  "player_goal_scorer_anytime",
] as const;

const TOTALS_POINT = 2.5;
const TOTALS_H1_POINT = 1.5;
const SPREAD_POINTS = [1, 2];
const GOALSCORER_FAVORITE_COUNT = 2;

/** Verilen pazar icin, sadece izin verilen (mutlak deger) puan cizgilerini birakir; diger pazarlara dokunmaz. */
function filterByPoint(quotes: OddsQuote[], market: string, allowedPoints: number[]): OddsQuote[] {
  return quotes.filter(
    (q) => q.market !== market || (q.point !== undefined && allowedPoints.includes(Math.abs(q.point))),
  );
}

/**
 * Golu atacak oyuncu pazarinda genelde 20-30+ oyuncu listelenir - hepsini
 * gostermek/prompt'a sokmak anlamsiz. Tek bir siteden (favori/surpriz
 * siralamasi karismasin diye) en dusuk iki oranli (favori) oyuncuyu ve
 * orta-ust siradan bir "surpriz" oyuncuyu seciyoruz.
 */
function selectGoalscorerPicks(quotes: OddsQuote[]): OddsQuote[] {
  const scorers = quotes.filter((q) => q.market === "player_goal_scorer_anytime" && q.description);
  if (scorers.length === 0) return [];

  const firstBookmaker = scorers[0].bookmaker;
  const sorted = scorers.filter((q) => q.bookmaker === firstBookmaker).sort((a, b) => a.price - b.price);
  if (sorted.length === 0) return [];

  const favorites = sorted.slice(0, GOALSCORER_FAVORITE_COUNT);
  // Favorilerin hemen "sonrasindaki" oyunculardan, listenin orta-ust
  // kesiminden birini surpriz olarak sec - favori indeksleriyle
  // cakismasin diye favori sayisindan sonraki kalan oyunculara gore
  // oranlanir.
  const remaining = sorted.length - GOALSCORER_FAVORITE_COUNT;
  const surpriseOffset = remaining > 0 ? Math.floor(remaining * 0.4) : 0;
  const surpriseIndex = Math.min(sorted.length - 1, GOALSCORER_FAVORITE_COUNT + surpriseOffset);
  const surprise = sorted[surpriseIndex];
  const picks = favorites.includes(surprise) ? favorites : [...favorites, surprise];

  return picks.map((q, i) => ({
    ...q,
    outcome: `${q.description} (${i < favorites.length ? "Favori" : "Surpriz"})`,
  }));
}

/**
 * Bir macin taraf bahsi disindaki pazarlarini (KG var/yok, 2.5 ust/alt,
 * ilk yari taraf bahsi/1.5 ust-alt/KG, handikap, gol atacak oyuncu) sadece
 * kimse o macin detay sayfasini actiginda VEYA analiz uretilmeden once,
 * eksik olanlar icin, tek seferlik cekilir ve kalici olarak
 * odds_snapshots'a yazilir. Boylece gunluk toplu sync butceye (500
 * kredi/ay) dokunmaz - maliyet sadece gercekten goruntulenen/analiz
 * edilen maclarla sinirli kalir (yine de not: bu kadar cok pazar, ilk
 * cekimde mac basina 7 krediye kadar cikabilir - bkz. spec).
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

  let filtered = filterByPoint(quotes, "totals", [TOTALS_POINT]);
  filtered = filterByPoint(filtered, "totals_h1", [TOTALS_H1_POINT]);
  filtered = filterByPoint(filtered, "spreads", SPREAD_POINTS);

  const nonGoalscorer = filtered.filter((q) => q.market !== "player_goal_scorer_anytime");
  const goalscorerPicks = selectGoalscorerPicks(filtered);

  // limitBookmakersPerMarket tercih edilen siteleri dener, o pazarda hicbiri
  // yoksa mevcut herhangi bir siteye duser - bu yuzden bir pazar asla
  // tamamen bos kalip her ziyarette tekrar API cagrisina yol acmaz. Gol
  // atacak oyuncu secimi kendi ozel mantigiyla yapildigi icin bu adimin
  // disinda tutulur.
  const relevant = [...limitBookmakersPerMarket(nonGoalscorer), ...goalscorerPicks];
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
