export interface OddsHistoryPoint {
  fetchedAt: string;
  outcome: string;
  bookmaker: string;
  price: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  price: number;
  fetchedAt: string;
}

export interface ChartSeries {
  outcome: string;
  points: ChartPoint[];
}

export function averagePricesByOutcome(quotes: { outcome: string; price: number }[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const q of quotes) {
    const entry = sums.get(q.outcome) ?? { total: 0, count: 0 };
    entry.total += q.price;
    entry.count += 1;
    sums.set(q.outcome, entry);
  }
  const result = new Map<string, number>();
  for (const [outcome, { total, count }] of sums) {
    result.set(outcome, total / count);
  }
  return result;
}

export interface PriceBounds {
  min: number;
  max: number;
}

export function getPriceBounds(history: OddsHistoryPoint[]): PriceBounds | null {
  if (history.length === 0) return null;
  const prices = history.map((h) => h.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function buildOddsChartSeries(history: OddsHistoryPoint[], width = 300, height = 100): ChartSeries[] {
  if (history.length === 0) return [];

  const byOutcome = new Map<string, Map<string, number[]>>();
  for (const point of history) {
    if (!byOutcome.has(point.outcome)) byOutcome.set(point.outcome, new Map());
    const byTime = byOutcome.get(point.outcome)!;
    if (!byTime.has(point.fetchedAt)) byTime.set(point.fetchedAt, []);
    byTime.get(point.fetchedAt)!.push(point.price);
  }

  const allTimestamps = [...new Set(history.map((h) => h.fetchedAt))].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const allPrices = history.map((h) => h.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  const series: ChartSeries[] = [];
  for (const [outcome, byTime] of byOutcome) {
    const sortedTimestamps = [...byTime.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const points: ChartPoint[] = sortedTimestamps.map((ts) => {
      const prices = byTime.get(ts)!;
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const timeIndex = allTimestamps.indexOf(ts);
      const x = allTimestamps.length > 1 ? (timeIndex / (allTimestamps.length - 1)) * width : width / 2;
      const y = height - ((avg - minPrice) / priceRange) * height;
      return { x, y, price: avg, fetchedAt: ts };
    });
    series.push({ outcome, points });
  }

  return series;
}
