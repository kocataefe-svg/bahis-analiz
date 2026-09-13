import type { SupabaseClient } from "@supabase/supabase-js";

export interface ManualOddsInsertRow {
  match_id: string;
  entered_by: string;
  market: string;
  outcome: string;
  price: number;
}

export async function insertManualOdds(supabase: SupabaseClient, row: ManualOddsInsertRow): Promise<void> {
  const { error } = await supabase.from("manual_odds").insert(row);
  if (error) throw new Error(`Manuel oran kaydedilemedi: ${error.message}`);
}

export interface ManualOddsRecord {
  id: string;
  enteredBy: string;
  outcome: string;
  price: number;
  enteredAt: string;
}

export async function getManualOddsForMatch(supabase: SupabaseClient, matchId: string): Promise<ManualOddsRecord[]> {
  const { data, error } = await supabase
    .from("manual_odds")
    .select("id, entered_by, outcome, price, entered_at")
    .eq("match_id", matchId)
    .order("entered_at", { ascending: false });

  if (error) throw new Error(`Manuel oranlar alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    entered_by: string;
    outcome: string;
    price: number;
    entered_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    enteredBy: row.entered_by,
    outcome: row.outcome,
    price: row.price,
    enteredAt: row.entered_at,
  }));
}
