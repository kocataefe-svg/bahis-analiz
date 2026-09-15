import type { AnalysisPromptInput } from "./analysis-prompt";
import { generateMatchAnalysis, GROQ_MODEL } from "./groq";
import { generateBettingAndSurpriseAnalysis, GEMINI_ANALYSIS_MODEL } from "./gemini-analysis";

export interface FullAnalysis {
  team_analyst_text: string;
  betting_analyst_text: string;
  commentator_text: string;
  surprise_pick_text: string;
  summary_text: string;
  model_used: string;
}

const BETTING_FALLBACK_TEXT = "Bahis analizi bu calisma icin uretilemedi.";

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
  };
}
