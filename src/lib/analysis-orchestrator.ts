import type { AnalysisPromptInput } from "./analysis-prompt";
import { generateMatchAnalysis, GROQ_MODEL } from "./groq";
import { generateBettingAndSurpriseAnalysis, GEMINI_ANALYSIS_MODEL } from "./gemini-analysis";
import type { RawPersonaPick, ResolvedPersonaPick } from "./persona-pick";

export type { ResolvedPersonaPick } from "./persona-pick";

export interface FullAnalysis {
  team_analyst_text: string;
  betting_analyst_text: string;
  commentator_text: string;
  surprise_pick_text: string;
  summary_text: string;
  model_used: string;
  team_analyst_pick: ResolvedPersonaPick | null;
  commentator_pick: ResolvedPersonaPick | null;
  betting_analyst_pick: ResolvedPersonaPick | null;
  surprise_combo_pick: ResolvedPersonaPick | null;
}

const BETTING_FALLBACK_TEXT = "Bahis analizi bu calisma icin uretilemedi.";

/**
 * Modelin verdigi {market, outcome} pick'ini gercek oran verisiyle
 * eslestirip fiyatini bulur - model hicbir zaman fiyat uretmiyor (bu
 * NO_FABRICATION_RULE'un bir parcasi), fiyat her zaman bizim elimizdeki
 * gercek oran satirindan geliyor. Eslesme bulunamazsa (model prompttaki
 * kurala ragmen var olmayan bir outcome uydurmus olabilir) pick tumden
 * atilir - kupona sahte bir fiyatla eklenebilecek bir sey gostermektense
 * hic gostermemek daha guvenli.
 */
function resolvePick(pick: RawPersonaPick | null, odds: AnalysisPromptInput["odds"]): ResolvedPersonaPick | null {
  if (!pick) return null;
  const match = odds.find((o) => o.market === pick.market && o.outcome === pick.outcome);
  if (!match) return null;
  return { market: pick.market, outcome: pick.outcome, price: match.price };
}

/**
 * Dort personayi iki bagimsiz saglayiciya bolerek uretir (Groq: Takim
 * Analizcisi + Yorumcu + ozet; Gemini: Bahis Analizcisi + Surpriz Yorumcu)
 * - tek saglayicinin ucretsiz kota/rate-limit sorunu tum analizi
 * dusurmesin diye. Groq ("cekirdek") basarisiz olursa analiz tumden iptal
 * edilir (null); Gemini ("ek") basarisiz olursa dogru alanlar bir
 * yer-tutucu metinle doldurulup analiz yine de kaydedilir.
 */
export async function generateFullAnalysis(input: AnalysisPromptInput): Promise<FullAnalysis | null> {
  const [core, extra] = await Promise.all([generateMatchAnalysis(input), generateBettingAndSurpriseAnalysis(input)]);

  if (!core) return null;

  return {
    team_analyst_text: core.teamAnalystText,
    commentator_text: core.commentatorText,
    summary_text: core.summaryText,
    betting_analyst_text: extra?.bettingAnalystText ?? BETTING_FALLBACK_TEXT,
    surprise_pick_text: extra?.surprisePickText ?? "",
    model_used: extra ? `${GROQ_MODEL}+${GEMINI_ANALYSIS_MODEL}` : GROQ_MODEL,
    team_analyst_pick: resolvePick(core.teamAnalystPick, input.odds),
    commentator_pick: resolvePick(core.commentatorPick, input.odds),
    betting_analyst_pick: resolvePick(extra?.bettingAnalystPick ?? null, input.odds),
    surprise_combo_pick: resolvePick(extra?.surpriseComboPick ?? null, input.odds),
  };
}
