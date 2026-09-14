"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";
import { insertManualOdds } from "@/lib/db/manual-odds";

export interface ManualOddsFormState {
  error: string | null;
  success: boolean;
}

const INITIAL_MANUAL_ODDS_STATE: ManualOddsFormState = { error: null, success: false };

export { INITIAL_MANUAL_ODDS_STATE };

export async function submitManualOdds(
  matchId: string,
  homeOutcome: string,
  awayOutcome: string,
  _prevState: ManualOddsFormState,
  formData: FormData,
): Promise<ManualOddsFormState> {
  const enteredBy = String(formData.get("enteredBy") ?? "").trim();
  if (!enteredBy) {
    return { error: "Adinizi girin.", success: false };
  }

  const fields: { name: string; outcome: string }[] = [
    { name: "homePrice", outcome: homeOutcome },
    { name: "drawPrice", outcome: "Draw" },
    { name: "awayPrice", outcome: awayOutcome },
  ];

  const entries: { outcome: string; price: number }[] = [];
  for (const field of fields) {
    const raw = formData.get(field.name);
    if (raw === null || raw === "") continue;
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 1) {
      return { error: "Oranlar 1'den buyuk bir sayi olmalidir.", success: false };
    }
    entries.push({ outcome: field.outcome, price });
  }

  if (entries.length === 0) {
    return { error: "En az bir oran girin.", success: false };
  }

  const supabase = getSupabaseClient();
  for (const entry of entries) {
    await insertManualOdds(supabase, {
      match_id: matchId,
      entered_by: enteredBy,
      market: "h2h",
      outcome: entry.outcome,
      price: entry.price,
    });
  }

  revalidatePath("/matches/[id]", "page");
  return { error: null, success: true };
}
