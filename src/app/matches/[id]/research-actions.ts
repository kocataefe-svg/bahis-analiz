"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById } from "@/lib/db/matches";
import { getMatchResearch, insertMatchResearch } from "@/lib/db/match-research";
import { researchMatchContext, RESEARCH_MODEL } from "@/lib/gemini-research";

export interface ResearchMatchState {
  error: string | null;
}

export async function researchMatch(matchId: string, _prevState: ResearchMatchState): Promise<ResearchMatchState> {
  const supabase = getSupabaseClient();

  const existing = await getMatchResearch(supabase, matchId);
  if (existing) {
    return { error: null };
  }

  const match = await getMatchById(supabase, matchId);
  if (!match) {
    return { error: "Mac bulunamadi." };
  }

  const result = await researchMatchContext({
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt,
  });

  if (!result) {
    return { error: "Arastirma basarisiz, tekrar deneyin." };
  }

  try {
    await insertMatchResearch(supabase, {
      match_id: matchId,
      content: result.content,
      sources: result.sources,
      model_used: RESEARCH_MODEL,
    });
  } catch {
    return { error: "Arastirma kaydedilemedi, tekrar deneyin." };
  }

  revalidatePath("/matches/[id]", "page");
  return { error: null };
}
