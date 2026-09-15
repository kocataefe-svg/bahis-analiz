import { describe, it, expect } from "vitest";
import { buildOddsChartSeries, averagePricesByOutcome, getPriceBounds } from "./odds-chart";

describe("averagePricesByOutcome", () => {
  it("averages prices across bookmakers for the same outcome", () => {
    const result = averagePricesByOutcome([
      { outcome: "Arsenal", price: 1.8 },
      { outcome: "Arsenal", price: 2.0 },
      { outcome: "Draw", price: 3.5 },
    ]);
    expect(result.get("Arsenal")).toBe(1.9);
    expect(result.get("Draw")).toBe(3.5);
  });

  it("returns an empty map for no quotes", () => {
    const result = averagePricesByOutcome([]);
    expect(result.size).toBe(0);
  });
});

describe("buildOddsChartSeries", () => {
  it("returns an empty array when there is no history", () => {
    expect(buildOddsChartSeries([])).toEqual([]);
  });

  it("groups by outcome and averages multiple bookmakers at the same timestamp", () => {
    const series = buildOddsChartSeries(
      [
        { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
        { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "bet365", price: 2.0 },
        { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9 },
      ],
      300,
      100,
    );

    expect(series).toHaveLength(1);
    expect(series[0].outcome).toBe("Arsenal");
    expect(series[0].points).toHaveLength(2);
    // First timestamp -> x=0 (earliest), last timestamp -> x=width (latest)
    expect(series[0].points[0].x).toBe(0);
    expect(series[0].points[1].x).toBe(300);
  });

  it("produces one series per distinct outcome", () => {
    const series = buildOddsChartSeries([
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Draw", bookmaker: "pinnacle", price: 3.5 },
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Chelsea", bookmaker: "pinnacle", price: 4.2 },
    ]);
    expect(series.map((s) => s.outcome).sort()).toEqual(["Arsenal", "Chelsea", "Draw"]);
  });

  it("maps a single timestamp to the horizontal center of the chart", () => {
    const series = buildOddsChartSeries(
      [{ fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 }],
      300,
      100,
    );
    expect(series[0].points[0].x).toBe(150);
  });

  it("maps the lowest price to the bottom (y=height) and highest to the top (y=0)", () => {
    const series = buildOddsChartSeries(
      [
        { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.5 },
        { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 3.0 },
      ],
      300,
      100,
    );
    expect(series[0].points[0].y).toBe(100);
    expect(series[0].points[1].y).toBe(0);
  });

  it("carries the raw averaged price and fetchedAt on each point (for axis/legend labels)", () => {
    const series = buildOddsChartSeries([
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "bet365", price: 2.0 },
    ]);
    expect(series[0].points[0].price).toBe(1.9);
    expect(series[0].points[0].fetchedAt).toBe("2026-09-12T12:00:00Z");
  });
});

describe("getPriceBounds", () => {
  it("returns null for no history", () => {
    expect(getPriceBounds([])).toBeNull();
  });

  it("returns the min and max price across all points", () => {
    const bounds = getPriceBounds([
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.5 },
      { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Draw", bookmaker: "pinnacle", price: 3.5 },
      { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Chelsea", bookmaker: "pinnacle", price: 4.2 },
    ]);
    expect(bounds).toEqual({ min: 1.5, max: 4.2 });
  });
});
