export interface OddsComparison {
  outcome: string;
  manualPrice: number;
  referencePrice: number;
  diff: number;
  diffPercent: number;
}

export function compareManualToReference(
  manualEntries: { outcome: string; price: number }[],
  referenceByOutcome: Map<string, number>,
): OddsComparison[] {
  const results: OddsComparison[] = [];
  for (const entry of manualEntries) {
    const referencePrice = referenceByOutcome.get(entry.outcome);
    if (referencePrice === undefined) continue;
    const diff = entry.price - referencePrice;
    const diffPercent = (diff / referencePrice) * 100;
    results.push({ outcome: entry.outcome, manualPrice: entry.price, referencePrice, diff, diffPercent });
  }
  return results;
}
