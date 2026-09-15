import { describe, it, expect, vi } from "vitest";

vi.mock("./odds-api", () => ({ getEventOdds: vi.fn() }));
vi.mock("./db/odds", () => ({ insertOddsSnapshots: vi.fn() }));

import { ensureExtraMarketsOdds } from "./odds-enrichment";
import { getEventOdds } from "./odds-api";
import { insertOddsSnapshots } from "./db/odds";

const supabase = {} as any;
const ALL_MARKETS = new Set(["totals", "btts", "h2h_h1", "totals_h1", "btts_h1", "spreads", "player_goal_scorer_anytime"]);

function quote(overrides: Record<string, unknown> = {}) {
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
  it("does nothing and returns false when every extra market already exists", async () => {
    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", ALL_MARKETS);
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

    expect(getEventOdds).toHaveBeenCalledWith(
      "soccer_epl",
      "evt1",
      "totals,btts,h2h_h1,totals_h1,btts_h1,spreads,player_goal_scorer_anytime",
    );
    expect(insertOddsSnapshots).toHaveBeenCalledWith(supabase, [
      { match_id: "m1", market: "totals", outcome: "Over 2.5", bookmaker: "pinnacle", price: 1.9 },
      { match_id: "m1", market: "totals", outcome: "Under 2.5", bookmaker: "pinnacle", price: 1.95 },
      { match_id: "m1", market: "btts", outcome: "Yes", bookmaker: "pinnacle", price: 1.7 },
    ]);
    expect(result).toBe(true);
  });

  it("only requests the markets that are still missing", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([quote({ market: "spreads", outcome: "Yes", point: undefined })]);
    const almostAll = new Set(ALL_MARKETS);
    almostAll.delete("spreads");

    await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", almostAll);

    expect(getEventOdds).toHaveBeenCalledWith("soccer_epl", "evt1", "spreads");
  });

  it("drops totals lines that are not the 2.5 point", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([quote({ market: "totals", outcome: "Over", point: 3.5, price: 1.5 })]);

    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());

    expect(insertOddsSnapshots).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("keeps only the 1.5 point for first-half totals", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([
      quote({ market: "totals_h1", outcome: "Over", point: 1, price: 1.6 }),
      quote({ market: "totals_h1", outcome: "Over", point: 1.5, price: 2.0 }),
    ]);

    await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());

    expect(insertOddsSnapshots).toHaveBeenCalledWith(supabase, [
      { match_id: "m1", market: "totals_h1", outcome: "Over 1.5", bookmaker: "pinnacle", price: 2.0 },
    ]);
  });

  it("keeps only +1/+2 handicap lines and drops other spread points", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([
      quote({ market: "spreads", outcome: "Arsenal", point: 0.25, price: 1.9, bookmaker: "onexbet" }),
      quote({ market: "spreads", outcome: "Arsenal", point: -1, price: 2.4, bookmaker: "pinnacle" }),
      quote({ market: "spreads", outcome: "Chelsea", point: 1, price: 1.6, bookmaker: "pinnacle" }),
      quote({ market: "spreads", outcome: "Arsenal", point: -2, price: 3.5, bookmaker: "unibet_nl" }),
    ]);

    await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());

    const rows = vi.mocked(insertOddsSnapshots).mock.calls[0][1];
    expect(rows.every((r) => /-?[12]$/.test(r.outcome))).toBe(true);
    expect(rows.some((r) => r.outcome.includes("0.25"))).toBe(false);
  });

  it("picks the two cheapest goalscorer prices as favorites and a mid-priced one as the surprise, from a single bookmaker", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([
      quote({ market: "player_goal_scorer_anytime", outcome: "Yes", point: undefined, description: "Player A", price: 2.5, bookmaker: "onexbet" }),
      quote({ market: "player_goal_scorer_anytime", outcome: "Yes", point: undefined, description: "Player B", price: 3.0, bookmaker: "onexbet" }),
      quote({ market: "player_goal_scorer_anytime", outcome: "Yes", point: undefined, description: "Player C", price: 6.0, bookmaker: "onexbet" }),
      quote({ market: "player_goal_scorer_anytime", outcome: "Yes", point: undefined, description: "Player D", price: 12.0, bookmaker: "onexbet" }),
      quote({ market: "player_goal_scorer_anytime", outcome: "Yes", point: undefined, description: "Player E (other book)", price: 1.5, bookmaker: "williamhill" }),
    ]);

    await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());

    const rows = vi.mocked(insertOddsSnapshots).mock.calls[0][1];
    const goalscorerRows = rows.filter((r) => r.market === "player_goal_scorer_anytime");
    expect(goalscorerRows).toHaveLength(3);
    expect(goalscorerRows.every((r) => r.bookmaker === "onexbet")).toBe(true);
    expect(goalscorerRows[0].outcome).toBe("Player A (Favori)");
    expect(goalscorerRows[1].outcome).toBe("Player B (Favori)");
    expect(goalscorerRows[2].outcome).toContain("(Surpriz)");
  });

  it("returns false without inserting when the API returns nothing usable", async () => {
    vi.mocked(getEventOdds).mockResolvedValue([]);
    const result = await ensureExtraMarketsOdds(supabase, "m1", "evt1", "soccer_epl", new Set());
    expect(insertOddsSnapshots).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
