/**
 * Bahis Analizcisi/Surpriz Yorumcu personalarinin (gemini-analysis.ts) duz
 * JSON uretimi icin kullanilir. Arastir ozelligi artik Gemini KULLANMIYOR
 * (bkz. web-research.ts) - eskiden ikisi ayni dar/paylasimli grounding
 * kotasini paylasiyordu, bu yuzden Arastir surekli kota hatasi veriyordu.
 * Yine de tek bir Google Cloud projesi/anahtarinin ucretsiz kotasi kisitli
 * olabilir; birden fazla ayri projeden anahtar eklenip GEMINI_API_KEYS'e
 * virgulle yazilirsa, kota dolan anahtardan bir sonrakine otomatik gecilir.
 */
export function getGeminiApiKeys(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    const keys = multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length > 0) return keys;
  }
  const single = process.env.GEMINI_API_KEY;
  if (single) return [single];
  throw new Error("GEMINI_API_KEYS veya GEMINI_API_KEY env degiskeni tanimli degil");
}

export function isQuotaExhaustedError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("RESOURCE_EXHAUSTED") || message.includes('"code":429');
}

export type GeminiCallResult<T> = { ok: true; value: T } | { ok: false; reason: "quota" | "unknown" };

/**
 * `attempt` her anahtar icin sirayla denenir. Kota hatasi (429/
 * RESOURCE_EXHAUSTED) alinirsa bir sonraki anahtara gecilir; kota-disi bir
 * hata alinirsa (parse hatasi, ag hatasi vb.) hemen durulur - o hata baska
 * bir anahtarla cozulmez, tekrar denemek anlamsiz.
 */
export async function callWithGeminiKeyFallback<T>(attempt: (apiKey: string) => Promise<T>): Promise<GeminiCallResult<T>> {
  const keys = getGeminiApiKeys();
  let lastReason: "quota" | "unknown" = "quota";

  for (const key of keys) {
    try {
      const value = await attempt(key);
      return { ok: true, value };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        lastReason = "quota";
        continue;
      }
      console.warn("Gemini cagrisi basarisiz (kota disi hata):", err);
      return { ok: false, reason: "unknown" };
    }
  }

  return { ok: false, reason: lastReason };
}
