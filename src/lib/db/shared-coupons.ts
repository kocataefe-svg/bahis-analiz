import type { SupabaseClient } from "@supabase/supabase-js";

export interface SharedCouponPickRow {
  matchId: string;
  matchLabel: string;
  market: string;
  outcome: string;
  price: number;
}

export interface SharedCouponInsertRow {
  user_name: string;
  picks: SharedCouponPickRow[];
  total_odds: number;
}

export async function insertSharedCoupon(supabase: SupabaseClient, row: SharedCouponInsertRow): Promise<void> {
  const { error } = await supabase.from("shared_coupons").insert(row);
  if (error) throw new Error(`Kupon paylasilamadi: ${error.message}`);
}

export interface SharedCoupon {
  id: string;
  userName: string;
  picks: SharedCouponPickRow[];
  totalOdds: number;
  createdAt: string;
}

const SHARED_COUPONS_LIMIT = 100;

export async function getSharedCoupons(supabase: SupabaseClient): Promise<SharedCoupon[]> {
  const { data, error } = await supabase
    .from("shared_coupons")
    .select("id, user_name, picks, total_odds, created_at")
    .order("created_at", { ascending: false })
    .limit(SHARED_COUPONS_LIMIT);

  if (error) throw new Error(`Kuponlar alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    user_name: string;
    picks: SharedCouponPickRow[];
    total_odds: number;
    created_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    userName: row.user_name,
    picks: row.picks,
    totalOdds: row.total_odds,
    createdAt: row.created_at,
  }));
}
