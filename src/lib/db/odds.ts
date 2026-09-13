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
