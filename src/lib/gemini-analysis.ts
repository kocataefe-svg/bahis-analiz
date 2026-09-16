import { GoogleGenAI } from "@google/genai";
import { buildBettingAndSurprisePrompt, type AnalysisPromptInput } from "./analysis-prompt";
import { normalizePersonaPick, type RawPersonaPick } from "./persona-pick";
import { callWithGeminiKeyFallback } from "./gemini-keys";

/** Bahis Analizcisi + Surpriz Yorumcu - "sayisal agirlikli" iki persona (bkz. analysis-prompt.ts). */
export const GEMINI_ANALYSIS_MODEL = "gemini-3.5-flash-lite";

export interface BettingAndSurpriseResult {
  bettingAnalystText: string;
  surprisePickText: string;
  bettingAnalystPick: RawPersonaPick | null;
  surpriseComboPick: RawPersonaPick | null;
}

interface RawJson {
  betting_analyst_text?: string;
  surprise_pick_text?: string;
  betting_analyst_pick?: unknown;
  surprise_combo_pick?: unknown;
}

const PICK_SCHEMA = {
  type: ["object", "null"],
  properties: {
    market: { type: "string" },
    outcome: { type: "string" },
  },
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    betting_analyst_text: { type: "string" },
    surprise_pick_text: { type: "string" },
    betting_analyst_pick: PICK_SCHEMA,
    surprise_combo_pick: PICK_SCHEMA,
  },
  required: ["betting_analyst_text", "surprise_pick_text"],
};

/**
 * Bahis Analizcisi + Surpriz Yorumcu personalarini Groq'tan ayri, Gemini
 * uzerinden uretir - boylece tek bir saglayicinin ucretsiz kota/rate-limit
 * riskine (bkz. Groq TPM sorunlari) tum analiz bagli kalmaz. Bu cagri
 * Google Search grounding KULLANMAZ (duz JSON uretimi) - Arastir
 * ozelliginin kullandigi ayri, dar grounding kotasini tuketmez.
 */
export async function generateBettingAndSurpriseAnalysis(
  input: AnalysisPromptInput,
): Promise<BettingAndSurpriseResult | null> {
  const prompt = buildBettingAndSurprisePrompt(input);

  const result = await callWithGeminiKeyFallback(async (apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: GEMINI_ANALYSIS_MODEL,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA,
      },
    });
    if (!interaction.output_text) {
      throw new Error("Gemini bahis/surpriz analizi bos yanit (output_text yok)");
    }
    return interaction.output_text;
  });

  if (!result.ok) {
    console.warn(`Gemini bahis/surpriz analizi basarisiz (${result.reason})`);
    return null;
  }

  let parsed: RawJson;
  try {
    parsed = JSON.parse(result.value) as RawJson;
  } catch (err) {
    console.warn("Gemini bahis/surpriz yaniti gecerli JSON degil:", err);
    return null;
  }

  if (!parsed.betting_analyst_text || !parsed.surprise_pick_text) {
    console.warn("Gemini bahis/surpriz yaniti eksik alan iceriyor");
    return null;
  }

  return {
    bettingAnalystText: parsed.betting_analyst_text,
    surprisePickText: parsed.surprise_pick_text,
    bettingAnalystPick: normalizePersonaPick(parsed.betting_analyst_pick),
    surpriseComboPick: normalizePersonaPick(parsed.surprise_combo_pick),
  };
}
