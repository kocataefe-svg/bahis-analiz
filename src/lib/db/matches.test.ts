import { describe, it, expect, vi } from "vitest";
import {
  upsertMatches,
  getUpcomingMatches,
  getUpcomingMatchesWithLeague,
  getMatchById,
  getMatchesAwaitingResult,
  getMatchTeamsByIds,
} from "./matches";

describe("upsertMatches", () => {
  it("does nothing when rows is empty", async () => {
    const upsert = vi.fn();
    const from = vi.fn(() => ({ upsert }));
    await upsertMatches({ from } as any, []);
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts rows with the odds api event id as the conflict key and returns ids", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: "m1", odds_api_event_id: "evt1" }],
      error: null,
    });
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    const rows = [
      {
        league_id: "l1",
        odds_api_event_id: "evt1",
        home_team: "A",
        away_team: "B",
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ];
    const result = await upsertMatches({ from } as any, rows);
    expect(from).toHaveBeenCalledWith("matches");
    expect(upsert).toHaveBeenCalledWith(rows, { onConflict: "odds_api_event_id" });
    expect(result).toEqual([{ id: "m1", oddsApiEventId: "evt1" }]);
  });

  it("throws when the upsert fails", async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    await expect(
      upsertMatches({ from } as any, [
        {
          league_id: "l1",
          odds_api_event_id: "evt1",
          home_team: "A",
          away_team: "B",
          kickoff_at: "2026-09-20T15:00:00Z",
        },
      ]),
    ).rejects.toThrow("boom");
  });
});

describe("getUpcomingMatches", () => {
  it("queries matches within the given window and maps rows to camelCase", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "m1",
          league_id: "l1",
          home_team: "A",
          away_team: "B",
          kickoff_at: "2026-09-20T15:00:00Z",
          odds_api_event_id: "evt1",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));

    const result = await getUpcomingMatches({ from } as any, 14, 200);

    expect(from).toHaveBeenCalledWith("matches");
    expect(limit).toHaveBeenCalledWith(200);
    expect(result).toEqual([
      {
        id: "m1",
        leagueId: "l1",
        homeTeam: "A",
        awayTeam: "B",
        kickoffAt: "2026-09-20T15:00:00Z",
        oddsApiEventId: "evt1",
      },
    ]);
  });
});

describe("getUpcomingMatchesWithLeague", () => {
  it("returns display-shaped matches within the window", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "m1",
          league_id: "l1",
          home_team: "Arsenal",
          away_team: "Chelsea",
          kickoff_at: "2026-09-20T15:00:00Z",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));

    const result = await getUpcomingMatchesWithLeague({ from } as any, 14, 300);

    expect(from).toHaveBeenCalledWith("matches");
    expect(limit).toHaveBeenCalledWith(300);
    expect(result).toEqual([
      { id: "m1", leagueId: "l1", homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-09-20T15:00:00Z" },
    ]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));
    await expect(getUpcomingMatchesWithLeague({ from } as any, 14, 300)).rejects.toThrow("boom");
  });
});

describe("getMatchById", () => {
  it("returns the match (with its odds api event id) when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "m1",
        league_id: "l1",
        home_team: "Arsenal",
        away_team: "Chelsea",
        kickoff_at: "2026-09-20T15:00:00Z",
        odds_api_event_id: "evt1",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchById({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("matches");
    expect(eq).toHaveBeenCalledWith("id", "m1");
    expect(result).toEqual({
      id: "m1",
      leagueId: "l1",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      kickoffAt: "2026-09-20T15:00:00Z",
      oddsApiEventId: "evt1",
    });
  });

  it("returns null when not found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getMatchById({ from } as any, "missing");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchById({ from } as any, "m1")).rejects.toThrow("boom");
  });
});

describe("getMatchesAwaitingResult", () => {
  it("filters to matches whose kickoff is at least the delay hours in the past, within the 3-day score window", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "m1",
          league_id: "l1",
          home_team: "A",
          away_team: "B",
          kickoff_at: "2026-09-20T15:00:00Z",
          odds_api_event_id: "evt1",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const gte = vi.fn(() => ({ order }));
    const lte = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ lte }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchesAwaitingResult({ from } as any, 1, 50);

    expect(from).toHaveBeenCalledWith("matches");
    expect(limit).toHaveBeenCalledWith(50);
    expect(result).toEqual([
      {
        id: "m1",
        leagueId: "l1",
        homeTeam: "A",
        awayTeam: "B",
        kickoffAt: "2026-09-20T15:00:00Z",
        oddsApiEventId: "evt1",
      },
    ]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const gte = vi.fn(() => ({ order }));
    const lte = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ lte }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchesAwaitingResult({ from } as any, 1, 50)).rejects.toThrow("boom");
  });
});

describe("getMatchTeamsByIds", () => {
  it("returns an empty map without querying when ids is empty", async () => {
    const from = vi.fn();
    const result = await getMatchTeamsByIds({ from } as any, []);
    expect(result).toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });

  it("returns a map keyed by match id", async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [{ id: "m1", home_team: "Arsenal", away_team: "Chelsea" }],
      error: null,
    });
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchTeamsByIds({ from } as any, ["m1"]);

    expect(from).toHaveBeenCalledWith("matches");
    expect(inFn).toHaveBeenCalledWith("id", ["m1"]);
    expect(result.get("m1")).toEqual({ homeTeam: "Arsenal", awayTeam: "Chelsea" });
  });

  it("throws when the query fails", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchTeamsByIds({ from } as any, ["m1"])).rejects.toThrow("boom");
  });
});
