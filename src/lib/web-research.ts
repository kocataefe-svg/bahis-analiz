import { searchWeb, type TavilySearchResult } from "./tavily";
import { generateGroqText, GROQ_MODEL } from "./groq";

export const RESEARCH_MODEL = `tavily+${GROQ_MODEL}`;

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

function buildSearchQuery(input: ResearchMatchInput): string {
  return `${input.homeTeam} vs ${input.awayTeam} injuries suspensions lineup news head to head last 5 matches results`;
}

function buildReportPrompt(input: ResearchMatchInput, results: TavilySearchResult[]): string {
  const sourceBlock = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`).join("\n\n");

  return [
    `${input.homeTeam} - ${input.awayTeam} macini arastir (${input.kickoffAt} tarihli).`,
    "Asagida bir arama motorundan gelen sonuclar var. SADECE bu sonuclarda gecen bilgiyi kullanarak Turkce raporla:",
    "1) Her iki takimin bilinen sakat/cezali oyunculari",
    "2) Her iki takimin son 5 resmi mac sonucu (rakip, skor, tarih)",
    "3) Bu iki takimin birbirine karsi son karsilasmalarindan 1-2 ornek",
    "Arama sonuclarinda gecmeyen veya emin olmadigin bilgiyi acikca 'bulunamadi' olarak belirt, uydurma.",
    "",
    "Arama sonuclari:",
    sourceBlock || "(sonuc bulunamadi)",
  ].join("\n");
}

/**
 * Arastir ozelligi eskiden Gemini'nin Google Search grounding'ini
 * kullaniyordu - bu, Gemini ucretsiz katmaninda cok dar/paylasimli bir
 * kota (bkz. gemini-keys.ts) ve pratikte surekli 429/RESOURCE_EXHAUSTED
 * veriyordu. Bunun yerine ayri bir arama saglayicisi (Tavily) + zaten
 * kullanilan Groq'u (duz metin modunda) birlestirir - aramanin kendisi
 * Gemini'nin grounding kotasina hic dokunmaz.
 */
export async function researchMatchContext(
  input: ResearchMatchInput,
): Promise<MatchResearchResult | ResearchFailure> {
  const searchResult = await searchWeb(buildSearchQuery(input));
  if (!searchResult.ok) {
    console.warn(`Arastirma web aramasi basarisiz (${searchResult.reason})`);
    return { reason: searchResult.reason };
  }

  const prompt = buildReportPrompt(input, searchResult.results);
  const content = await generateGroqText(prompt);
  if (!content) {
    return { reason: "unknown" };
  }

  const sources: MatchResearchSource[] = searchResult.results
    .map((r) => ({ url: r.url, title: r.title }))
    .filter((s) => s.url);

  return { content, sources };
}
