import { GoogleGenAI } from "@google/genai";

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

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY env degiskeni tanimli degil");
  }
  return key;
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

export async function researchMatchContext(input: ResearchMatchInput): Promise<MatchResearchResult | null> {
  const apiKey = getApiKey();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: RESEARCH_MODEL,
      contents: buildResearchPrompt(input),
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) {
      console.warn("Gemini arastirma yaniti bos");
      return null;
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: MatchResearchSource[] = chunks
      .map((c) => ({ url: c.web?.uri ?? "", title: c.web?.title ?? "" }))
      .filter((s) => s.url);

    return { content: text, sources };
  } catch (err) {
    console.warn("Gemini arastirmasi basarisiz:", err);
    return null;
  }
}
