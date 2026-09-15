import { describe, it, expect } from "vitest";
import { formatPickLabel } from "./market-labels";

describe("formatPickLabel", () => {
  it("formats a first-half BTTS pick as the user's expected short Turkish label", () => {
    expect(formatPickLabel("btts_h1", "Yes")).toBe("IY KG Var");
  });

  it("formats a totals pick, translating Over/Under while keeping the point value", () => {
    expect(formatPickLabel("totals", "Over 2.5")).toBe("2.5 Ust");
    expect(formatPickLabel("totals_h1", "Under 1.5")).toBe("IY 1.5 Alt");
  });

  it("keeps a team name outcome as-is for h2h", () => {
    expect(formatPickLabel("h2h", "Arsenal")).toBe("MS Arsenal");
  });

  it("falls back to the raw market/outcome for unknown values", () => {
    expect(formatPickLabel("unknown_market", "unknown_outcome")).toBe("unknown_market unknown_outcome");
  });
});
