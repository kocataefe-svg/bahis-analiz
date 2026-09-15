import { describe, it, expect } from "vitest";
import { limitBookmakersPerMarket, DISPLAY_BOOKMAKERS, MAX_BOOKMAKERS_PER_MARKET } from "./display-bookmakers";

describe("limitBookmakersPerMarket", () => {
  it("keeps preferred bookmakers first, up to the max, per market", () => {
    const quotes = [
      { eventId: "e1", market: "h2h", bookmaker: "random1", outcome: "A", price: 1 },
      { eventId: "e1", market: "h2h", bookmaker: DISPLAY_BOOKMAKERS[0], outcome: "A", price: 2 },
      { eventId: "e1", market: "h2h", bookmaker: DISPLAY_BOOKMAKERS[1], outcome: "A", price: 3 },
      { eventId: "e1", market: "h2h", bookmaker: "random2", outcome: "A", price: 4 },
    ];
    const result = limitBookmakersPerMarket(quotes);
    const bookmakers = result.map((r) => r.bookmaker);
    expect(bookmakers).toHaveLength(MAX_BOOKMAKERS_PER_MARKET);
    expect(bookmakers).toEqual(DISPLAY_BOOKMAKERS);
  });

  it("falls back to whatever bookmakers exist when none of the preferred ones cover this market", () => {
    const quotes = [
      { eventId: "e1", market: "btts", bookmaker: "random1", outcome: "Yes", price: 1.7 },
      { eventId: "e1", market: "btts", bookmaker: "random2", outcome: "Yes", price: 1.8 },
      { eventId: "e1", market: "btts", bookmaker: "random3", outcome: "Yes", price: 1.9 },
    ];
    const result = limitBookmakersPerMarket(quotes);
    expect(result).toHaveLength(MAX_BOOKMAKERS_PER_MARKET);
    expect(result.map((r) => r.bookmaker)).toEqual(["random1", "random2"]);
  });

  it("scopes the limit per event, not globally across a multi-match batch", () => {
    const quotes = [
      // event A: only the preferred bookmakers
      { eventId: "eA", market: "h2h", bookmaker: DISPLAY_BOOKMAKERS[0], outcome: "X", price: 1 },
      // event B: none of the preferred bookmakers cover it - must still get a fallback, not zero rows
      { eventId: "eB", market: "h2h", bookmaker: "onlyThisOne", outcome: "Y", price: 2 },
    ];
    const result = limitBookmakersPerMarket(quotes);
    expect(result.filter((r) => r.eventId === "eA")).toHaveLength(1);
    expect(result.filter((r) => r.eventId === "eB")).toHaveLength(1);
    expect(result.find((r) => r.eventId === "eB")?.bookmaker).toBe("onlyThisOne");
  });

  it("keeps each market's own cap independent within the same event", () => {
    const quotes = [
      { eventId: "e1", market: "h2h", bookmaker: DISPLAY_BOOKMAKERS[0], outcome: "A", price: 1 },
      { eventId: "e1", market: "totals", bookmaker: "onlyTotalsBook", outcome: "Over 2.5", price: 1.9 },
    ];
    const result = limitBookmakersPerMarket(quotes);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.market === "totals")?.bookmaker).toBe("onlyTotalsBook");
  });

  it("returns an empty array for an empty input", () => {
    expect(limitBookmakersPerMarket([])).toEqual([]);
  });
});
