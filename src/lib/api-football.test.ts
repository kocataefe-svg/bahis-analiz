import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchLeague, getUpcomingFixtures, getRecentFixtures, getInjuriesForFixture } from "./api-football";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("API_FOOTBALL_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchLeague", () => {
  it("returns the league id and current season when found", async () => {
    mockFetchOnce({
      response: [
        {
          league: { id: 39, name: "Premier League" },
          seasons: [
            { year: 2025, current: false },
            { year: 2026, current: true },
          ],
        },
      ],
    });
    const result = await searchLeague("Premier League", "England");
    expect(result).toEqual({ apiFootballId: 39, currentSeason: 2026 });
  });

  it("returns null when no league is found", async () => {
    mockFetchOnce({ response: [] });
    const result = await searchLeague("Nonexistent League", "Nowhere");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await searchLeague("Premier League", "England");
    expect(result).toBeNull();
  });
});

describe("getUpcomingFixtures", () => {
  it("parses fixture list into the expected shape", async () => {
    mockFetchOnce({
      response: [
        {
          fixture: { id: 1001, date: "2026-09-20T15:00:00+00:00" },
          teams: {
            home: { id: 50, name: "Manchester City" },
            away: { id: 42, name: "Arsenal" },
          },
        },
      ],
    });
    const result = await getUpcomingFixtures(39, 2026, "2026-09-15", "2026-09-25");
    expect(result).toEqual([
      {
        apiFixtureId: 1001,
        kickoffAt: "2026-09-20T15:00:00+00:00",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
      },
    ]);
  });

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await getUpcomingFixtures(39, 2026, "2026-09-15", "2026-09-25");
    expect(result).toEqual([]);
  });
});

describe("getRecentFixtures", () => {
  it("computes W/D/L relative to the given team, including when they played away", async () => {
    mockFetchOnce({
      response: [
        {
          fixture: { id: 900, date: "2026-09-01T15:00:00+00:00" },
          teams: { home: { id: 50, name: "Manchester City" }, away: { id: 42, name: "Arsenal" } },
          goals: { home: 2, away: 1 },
        },
        {
          fixture: { id: 901, date: "2026-08-25T15:00:00+00:00" },
          teams: { home: { id: 42, name: "Arsenal" }, away: { id: 50, name: "Manchester City" } },
          goals: { home: 1, away: 1 },
        },
      ],
    });
    const result = await getRecentFixtures(50, 2);
    expect(result).toEqual([
      {
        apiFixtureId: 900,
        date: "2026-09-01T15:00:00+00:00",
        opponent: "Arsenal",
        goalsFor: 2,
        goalsAgainst: 1,
        result: "W",
      },
      {
        apiFixtureId: 901,
        date: "2026-08-25T15:00:00+00:00",
        opponent: "Arsenal",
        goalsFor: 1,
        goalsAgainst: 1,
        result: "D",
      },
    ]);
  });
});

describe("getInjuriesForFixture", () => {
  it("returns the raw injuries array", async () => {
    mockFetchOnce({ response: [{ player: { name: "Someone" }, type: "Injury" }] });
    const result = await getInjuriesForFixture(1001);
    expect(result).toEqual([{ player: { name: "Someone" }, type: "Injury" }]);
  });

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await getInjuriesForFixture(1001);
    expect(result).toEqual([]);
  });
});

describe("missing API key", () => {
  it("throws when API_FOOTBALL_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(searchLeague("Premier League", "England")).rejects.toThrow();
  });
});

describe("network errors", () => {
  it("returns null when fetch rejects due to network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await searchLeague("Premier League", "England");
    expect(result).toBeNull();
  });
});
