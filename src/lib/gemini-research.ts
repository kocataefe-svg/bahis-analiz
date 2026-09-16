import { GoogleGenAI } from "@google/genai";
import { callWithGeminiKeyFallback } from "./gemini-keys";

export const RESEARCH_MODEL = "gemini-3.5-flash-lite";

export interface MatchResearchSource {
  url: string;
  title: string;
}

export interface MatchResearchResult {
  content: string;
  sources: MatchResearchSource[];
}

export interface ResearchMatchInput {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
}

export type ResearchFailureReason = "quota" | "unknown";

export interface ResearchFailure {
  reason: ResearchFailureReason;
}

function buildResearchPrompt(input: ResearchMatchInput): string {
  return [
    `${input.homeTeam} - ${input.awayTeam} macini arastir (${input.kickoffAt} tarihli).`,
    "Su bilgileri bul ve Turkce raporla:",
    "1) Her iki takimin bilinen sakat/cezali oyunculari",
    "2) Her iki takimin son 5 resmi mac sonucu (rakip, skor, tarih)",
    "3) Bu iki takimin birbirine karsi son karsilasmalarindan 1-2 ornek",
    "Emin olmadigin veya bulamadigin bilgiyi acikca 'bulunamadi' olarak belirt, uydurma.",
  ].join("\n");
}

export async function researchMatchContext(
  input: ResearchMatchInput,
): Promise<MatchResearchResult | ResearchFailure> {
  const prompt = buildResearchPrompt(input);

  const result = await callWithGeminiKeyFallback(async (apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: RESEARCH_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    if (!response.text) {
      throw new Error("Gemini arastirma yaniti bos");
    }
    return response;
  });

  if (!result.ok) {
    console.warn(`Gemini arastirmasi basarisiz (${result.reason})`);
    return { reason: result.reason };
  }

  const response = result.value;
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: MatchResearchSource[] = chunks
    .map((c) => ({ url: c.web?.uri ?? "", title: c.web?.title ?? "" }))
    .filter((s) => s.url);

  return { content: response.text as string, sources };
}
