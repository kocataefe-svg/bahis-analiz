import { describe, it, expect, vi } from "vitest";

vi.mock("./odds-api", () => ({ getEventOdds: vi.fn() }));
vi.mock("./db/odds", () => ({ insertOddsSnapshots: vi.fn() }));

import { ensureExtraMarketsOdds } from "./odds-enrichment";
import { getEventOdds } from "./odds-api";
import { insertOddsSnapshots } from "./db/odds";

const supabase = {} as any;

function quote(overrides: Partial<Parameters<typeof getEventOdds> extends never ? never : any> = {}) {
  return {
    eventId: "evt1",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    commenceTime: "2026-09-20T15:00:00Z",
    bookmaker: "pinnacle",
    market: "totals",
    outcome: "Over",
    point: 2.5,
    price: 1.9,
    ...overrides,
  };
}

describe("ensureExtraMarketsOdds", () => {
  it("does nothing and returns false when both extra markets already exist", async () => {
    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set(["totals", "btts"]));
    expect(result).toBe(false);
    expect(getEventOdds).not.toHaveBeenCalled();
  });

  it("fetches only the missing markets and inserts them, encoding the totals point into the outcome", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([
      quote({ market: "totals", outcome: "Over", point: 2.5, price: 1.9 }),
      quote({ market: "totals", outcome: "Under", point: 2.5, price: 1.95 }),
      quote({ market: "btts", outcome: "Yes", point: undefined, price: 1.7 }),
    ]);

    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());

    expect(getEventOdds).toHaveBeenCalledWith("soccer_epl", "evt1", "totals,btts");
    expect(insertOddsSnapshots).toHaveBeenCalledWith(supabase, [
      { match_id: "m1", market: "totals", outcome: "Over 2.5", bookmaker: "pinnacle", price: 1.9 },
      { match_id: "m1", market: "totals", outcome: "Under 2.5", bookmaker: "pinnacle", price: 1.95 },
      { match_id: "m1", market: "btts", outcome: "Yes", bookmaker: "pinnacle", price: 1.7 },
    ]);
    expect(result).toBe(true);
  });

  it("only requests the market that is still missing", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([quote({ market: "btts", outcome: "Yes", point: undefined })]);

    await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set(["totals"]));

    expect(getEventOdds).toHaveBeenCalledWith("soccer_epl", "evt1", "btts");
  });

  it("drops totals lines that are not the 2.5 point", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([quote({ market: "totals", outcome: "Over", point: 3.5, price: 1.5 })]);

    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());

    expect(insertOddsSnapshots).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("returns false without inserting when the API returns nothing usable", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([]);
    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());
    expect(insertOddsSnapshots).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
