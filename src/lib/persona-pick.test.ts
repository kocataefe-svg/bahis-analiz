import { describe, it, expect } from "vitest";
import { normalizePersonaPicks, coerceResolvedPersonaPicks } from "./persona-pick";

describe("normalizePersonaPicks", () => {
  it("returns an empty array for null/undefined/malformed values", () => {
    expect(normalizePersonaPicks(null)).toEqual([]);
    expect(normalizePersonaPicks(undefined)).toEqual([]);
    expect(normalizePersonaPicks("gecersiz")).toEqual([]);
    expect(normalizePersonaPicks({ market: "h2h" })).toEqual([]);
  });

  it("wraps a single valid object into a one-element array", () => {
    expect(normalizePersonaPicks({ market: "h2h", outcome: "Arsenal" })).toEqual([
      { market: "h2h", outcome: "Arsenal" },
    ]);
  });

  it("accepts an array of up to two valid picks", () => {
    const picks = normalizePersonaPicks([
      { market: "h2h", outcome: "Arsenal" },
      { market: "totals", outcome: "Over 2.5" },
    ]);
    expect(picks).toEqual([
      { market: "h2h", outcome: "Arsenal" },
      { market: "totals", outcome: "Over 2.5" },
    ]);
  });

  it("caps at two picks, dropping extras", () => {
    const picks = normalizePersonaPicks([
      { market: "h2h", outcome: "Arsenal" },
      { market: "totals", outcome: "Over 2.5" },
      { market: "btts", outcome: "Yes" },
    ]);
    expect(picks).toHaveLength(2);
  });

  it("drops a second pick from the same market (contradictory/duplicate)", () => {
    const picks = normalizePersonaPicks([
      { market: "h2h", outcome: "Arsenal" },
      { market: "h2h", outcome: "Chelsea" },
    ]);
    expect(picks).toEqual([{ market: "h2h", outcome: "Arsenal" }]);
  });

  it("skips malformed elements within an otherwise valid array", () => {
    const picks = normalizePersonaPicks([{ market: "h2h", outcome: "Arsenal" }, "gecersiz", { market: "totals" }]);
    expect(picks).toEqual([{ market: "h2h", outcome: "Arsenal" }]);
  });
});

describe("coerceResolvedPersonaPicks", () => {
  it("returns an empty array for null/undefined", () => {
    expect(coerceResolvedPersonaPicks(null)).toEqual([]);
    expect(coerceResolvedPersonaPicks(undefined)).toEqual([]);
  });

  it("wraps a legacy single resolved-pick object (pre-array DB rows) into an array", () => {
    expect(coerceResolvedPersonaPicks({ market: "h2h", outcome: "Arsenal", price: 1.8 })).toEqual([
      { market: "h2h", outcome: "Arsenal", price: 1.8 },
    ]);
  });

  it("passes through an already-array value", () => {
    const value = [
      { market: "h2h", outcome: "Arsenal", price: 1.8 },
      { market: "totals", outcome: "Over 2.5", price: 1.9 },
    ];
    expect(coerceResolvedPersonaPicks(value)).toEqual(value);
  });

  it("drops an element missing the resolved price (e.g. a raw, unresolved pick)", () => {
    expect(coerceResolvedPersonaPicks({ market: "h2h", outcome: "Arsenal" })).toEqual([]);
  });
});
