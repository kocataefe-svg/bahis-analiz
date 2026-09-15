"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";
import { insertSharedCoupon, type SharedCouponPickRow } from "@/lib/db/shared-coupons";

export interface ShareCouponState {
  error: string | null;
  success: boolean;
}

export async function shareCoupon(
  userName: string,
  picks: SharedCouponPickRow[],
  totalOdds: number,
  _prevState: ShareCouponState,
): Promise<ShareCouponState> {
  if (!userName.trim()) {
    return { error: "Once kim oldugunu sec.", success: false };
  }
  if (picks.length === 0) {
    return { error: "Kuponunda secim yok.", success: false };
  }

  try {
    const supabase = getSupabaseClient();
    await insertSharedCoupon(supabase, { user_name: userName, picks, total_odds: totalOdds });
  } catch {
    return { error: "Kupon paylasilamadi, tekrar deneyin.", success: false };
  }

  revalidatePath("/kuponlar");
  return { error: null, success: true };
}
