import { describe, it, expect, vi } from "vitest";
import { upsertMatches, getUpcomingMatches } from "./matches";

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
