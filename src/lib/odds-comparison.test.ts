import { describe, it, expect } from "vitest";
import { compareManualToReference } from "./odds-comparison";

describe("compareManualToReference", () => {
  it("computes the absolute and percentage difference against the reference price", () => {
    const referenceByOutcome = new Map([["Arsenal", 1.9]]);
    const result = compareManualToReference([{ outcome: "Arsenal", price: 2.0 }], referenceByOutcome);

    expect(result).toEqual([
      {
        outcome: "Arsenal",
        manualPrice: 2.0,
        referencePrice: 1.9,
        diff: expect.closeTo(0.1, 5),
        diffPercent: expect.closeTo((0.1 / 1.9) * 100, 5),
      },
    ]);
  });

  it("skips entries with no matching reference price", () => {
    const referenceByOutcome = new Map([["Arsenal", 1.9]]);
    const result = compareManualToReference([{ outcome: "Draw", price: 3.4 }], referenceByOutcome);
    expect(result).toEqual([]);
  });

  it("returns an empty array for no manual entries", () => {
    const result = compareManualToReference([], new Map());
    expect(result).toEqual([]);
  });
});
