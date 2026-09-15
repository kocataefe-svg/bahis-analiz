import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getOddsForSport, getEventOdds } from "./odds-api";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => body }));
}

beforeEach(() => {
  vi.stubEnv("ODDS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getOddsForSport", () => {
  it("flattens events/bookmakers/markets/outcomes into a flat quote list", async () => {
    mockFetchOnce([
      {
        id: "evt1",
        home_team: "Manchester City",
        away_team: "Arsenal",
        commence_time: "2026-09-20T15:00:00Z",
        bookmakers: [
          {
            key: "pinnacle",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Manchester City", price: 1.8 },
                  { name: "Arsenal", price: 4.2 },
                  { name: "Draw", price: 3.6 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const result = await getOddsForSport("soccer_epl");
    expect(result).toEqual([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Manchester City",
        price: 1.8,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Draw",
        price: 3.6,
      },
    ]);
  });

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await getOddsForSport("soccer_epl");
    expect(result).toEqual([]);
  });

  it("throws when ODDS_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(getOddsForSport("soccer_epl")).rejects.toThrow();
  });

  it("returns an empty array when fetch rejects with a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await getOddsForSport("soccer_epl");
    expect(result).toEqual([]);
  });
});

describe("getEventOdds", () => {
  it("flattens a single event's bookmakers/markets/outcomes, keeping the point field", async () => {
    mockFetchOnce({
      id: "evt1",
      home_team: "Manchester City",
      away_team: "Arsenal",
      commence_time: "2026-09-20T15:00:00Z",
      bookmakers: [
        {
          key: "pinnacle",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", point: 2.5, price: 1.9 },
                { name: "Under", point: 2.5, price: 1.95 },
              ],
            },
          ],
        },
      ],
    });
    const result = await getEventOdds("soccer_epl", "evt1", "totals,btts");
    expect(result).toEqual([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "totals",
        outcome: "Over",
        point: 2.5,
        price: 1.9,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "totals",
        outcome: "Under",
        point: 2.5,
        price: 1.95,
      },
    ]);
  });

  it("carries the outcome description (player name for player-props markets)", async () => {
    mockFetchOnce({
      id: "evt1",
      home_team: "Manchester City",
      away_team: "Arsenal",
      commence_time: "2026-09-20T15:00:00Z",
      bookmakers: [
        {
          key: "onexbet",
          markets: [
            {
              key: "player_goal_scorer_anytime",
              outcomes: [{ name: "Yes", description: "Erling Haaland", price: 1.5 }],
            },
          ],
        },
      ],
    });
    const result = await getEventOdds("soccer_epl", "evt1", "player_goal_scorer_anytime");
    expect(result[0].description).toBe("Erling Haaland");
  });

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 404);
    const result = await getEventOdds("soccer_epl", "evt1", "totals,btts");
    expect(result).toEqual([]);
  });

  it("returns an empty array when fetch rejects with a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await getEventOdds("soccer_epl", "evt1", "totals,btts");
    expect(result).toEqual([]);
  });
});
