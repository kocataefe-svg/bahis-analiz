import type { SupabaseClient } from "@supabase/supabase-js";

export interface OddsInsertRow {
  match_id: string;
  market: string;
  outcome: string;
  bookmaker: string;
  price: number;
}

export async function insertOddsSnapshots(supabase: SupabaseClient, rows: OddsInsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("odds_snapshots").insert(rows);
  if (error) throw new Error(`Oranlar kaydedilemedi: ${error.message}`);
}

export interface LatestOddsQuote {
  market: string;
  outcome: string;
  bookmaker: string;
  price: number;
  fetchedAt: string;
}

export async function getLatestOdds(supabase: SupabaseClient, matchId: string): Promise<LatestOddsQuote[]> {
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("market, outcome, bookmaker, price, fetched_at")
    .eq("match_id", matchId)
    .order("fetched_at", { ascending: false });

  if (error) throw new Error(`Oranlar alinamadi: ${error.message}`);

  interface RawRow {
    market: string;
    outcome: string;
    bookmaker: string;
    price: number;
    fetched_at: string;
  }

  const rows = (data ?? []) as RawRow[];
  if (rows.length === 0) return [];

  // Her market kendi son cekim zamanina sahip olabilir (h2h gunluk sync,
  // totals/btts talep uzerine tek seferlik) - bu yuzden tek bir global
  // "son fetched_at" yerine market basina en sonuncusu alinir.
  const latestByMarket = new Map<string, string>();
  for (const row of rows) {
    if (!latestByMarket.has(row.market)) latestByMarket.set(row.market, row.fetched_at);
  }

  return rows
    .filter((r) => r.fetched_at === latestByMarket.get(r.market))
    .map((r) => ({ market: r.market, outcome: r.outcome, bookmaker: r.bookmaker, price: r.price, fetchedAt: r.fetched_at }));
}

export interface OddsHistoryPoint {
  fetchedAt: string;
  market: string;
  outcome: string;
  bookmaker: string;
  price: number;
}

export async function getOddsHistory(supabase: SupabaseClient, matchId: string): Promise<OddsHistoryPoint[]> {
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("market, outcome, bookmaker, price, fetched_at")
    .eq("match_id", matchId)
    .order("fetched_at", { ascending: true });

  if (error) throw new Error(`Oran gecmisi alinamadi: ${error.message}`);

  interface RawRow {
    market: string;
    outcome: string;
    bookmaker: string;
    price: number;
    fetched_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    fetchedAt: row.fetched_at,
    market: row.market,
    outcome: row.outcome,
    bookmaker: row.bookmaker,
    price: row.price,
  }));
}
