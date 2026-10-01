/** Bir AI persona'sinin onerdigi tek bir pazar+sonuc cifti. */
export interface RawPersonaPick {
  market: string;
  outcome: string;
}

/** Fiyati gercek oran verisiyle eslestirilmis, kupona eklenebilir hale gelmis pick. */
export interface ResolvedPersonaPick extends RawPersonaPick {
  price: number;
}

const MAX_PICKS_PER_PERSONA = 2;

function isValidRawPick(value: unknown): value is RawPersonaPick {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.market !== "string" || typeof v.outcome !== "string") return false;
  return Boolean(v.market.trim() && v.outcome.trim());
}

/**
 * Modelden gelen ham "pick" alanini guvenli sekilde ayristirir - model bir
 * dizi (0-2 eleman) veya (eski formata/hataya karsi toleransli olmak icin)
 * tek bir obje donebilir. Sekli bozuk elemanlar sessizce atilir (uydurma bir
 * pick gostermektense hic gostermemek daha iyi), ayni pazardan birden fazla
 * (celisen) pick gelirse sadece ilki tutulur.
 */
export function normalizePersonaPicks(value: unknown): RawPersonaPick[] {
  const candidates = Array.isArray(value) ? value : [value];

  const seenMarkets = new Set<string>();
  const picks: RawPersonaPick[] = [];
  for (const candidate of candidates) {
    if (!isValidRawPick(candidate)) continue;
    if (seenMarkets.has(candidate.market)) continue;
    seenMarkets.add(candidate.market);
    picks.push({ market: candidate.market, outcome: candidate.outcome });
    if (picks.length >= MAX_PICKS_PER_PERSONA) break;
  }
  return picks;
}
