import { describe, it, expect, vi } from "vitest";
import { upsertMatches, getUpcomingMatches, getUpcomingMatchesWithLeague, getMatchById } from "./matches";

describe("upsertMatches", () => {
  it("does nothing when rows is empty", async () => {
    const upsert = vi.fn();
    const from = vi.fn(() => ({ upsert }));
    await upsertMatches({ from } as any, []);
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts rows with the fixture id as the conflict key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    const rows = [
      {
        league_id: "l1",
        api_football_fixture_id: 1001,
        home_team: "A",
        away_team: "B",
        home_team_api_id: 1,
        away_team_api_id: 2,
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ];
    await upsertMatches({ from } as any, rows);
    expect(from).toHaveBeenCalledWith("matches");
    expect(upsert).toHaveBeenCalledWith(rows, { onConflict: "api_football_fixture_id" });
  });

  it("throws when the upsert fails", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ upsert }));
    await expect(
      upsertMatches({ from } as any, [
        {
          league_id: "l1",
          api_football_fixture_id: 1001,
          home_team: "A",
          away_team: "B",
          home_team_api_id: 1,
          away_team_api_id: 2,
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
          api_football_fixture_id: 1001,
          home_team: "A",
          away_team: "B",
          home_team_api_id: 1,
          away_team_api_id: 2,
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

    const result = await getUpcomingMatches({ from } as any, 14, 200);

    expect(from).toHaveBeenCalledWith("matches");
    expect(limit).toHaveBeenCalledWith(200);
    expect(result).toEqual([
      {
        id: "m1",
        apiFixtureId: 1001,
        homeTeam: "A",
        awayTeam: "B",
        homeTeamApiId: 1,
        awayTeamApiId: 2,
        kickoffAt: "2026-09-20T15:00:00Z",
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
  it("returns the match when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "m1",
        league_id: "l1",
        home_team: "Arsenal",
        away_team: "Chelsea",
        kickoff_at: "2026-09-20T15:00:00Z",
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
