const TAVILY_API_URL = "https://api.tavily.com/search";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
}

export type TavilySearchOutcome =
  | { ok: true; results: TavilySearchResult[] }
  | { ok: false; reason: "quota" | "unknown" };

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error("TAVILY_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

// Tavily planin usage limitini asinca 429 (rate limit) veya 432/433 (plan
// limiti/kredisi bitti) donduruyor - hepsi "quota" olarak ele alinir, cagiran
// taraf Gemini arastirmasindaki ayni "birkac saat sonra tekrar dene" akisini
// kullanabilsin diye.
const QUOTA_STATUS_CODES = new Set([429, 432, 433]);

export async function searchWeb(query: string, maxResults = 8): Promise<TavilySearchOutcome> {
  const apiKey = getApiKey();

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: maxResults,
      }),
    });

    if (!res.ok) {
      if (QUOTA_STATUS_CODES.has(res.status)) {
        return { ok: false, reason: "quota" };
      }
      console.warn(`Tavily arama istegi basarisiz: ${res.status} ${await res.text()}`);
      return { ok: false, reason: "unknown" };
    }

    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    const results: TavilySearchResult[] = (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ title: r.title ?? "", url: r.url as string, content: r.content ?? "" }));
    return { ok: true, results };
  } catch (err) {
    console.warn("Tavily arama istegi basarisiz (ag hatasi):", err);
    return { ok: false, reason: "unknown" };
  }
}
