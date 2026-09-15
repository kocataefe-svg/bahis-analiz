/** Bir AI persona'sinin "en guvendigi" tek pazar+sonuc ciftini temsil eder. */
export interface RawPersonaPick {
  market: string;
  outcome: string;
}

/** Fiyati gercek oran verisiyle eslestirilmis, kupona eklenebilir hale gelmis pick. */
export interface ResolvedPersonaPick extends RawPersonaPick {
  price: number;
}

/**
 * Modelden gelen ham "pick" alanini guvenli sekilde ayristirir - model
 * yanlis sekilli bir deger (string, eksik alan, null degil de bos obje vb.)
 * donebilir, bu durumda sessizce null'a dusuyoruz (uydurma bir pick
 * gostermektense hic gostermemek daha iyi).
 */
export function normalizePersonaPick(value: unknown): RawPersonaPick | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.market !== "string" || typeof v.outcome !== "string") return null;
  if (!v.market.trim() || !v.outcome.trim()) return null;
  return { market: v.market, outcome: v.outcome };
}
