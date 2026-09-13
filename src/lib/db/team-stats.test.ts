import { describe, it, expect, vi } from "vitest";
import { insertTeamStatsSnapshot } from "./team-stats";

describe("insertTeamStatsSnapshot", () => {
  it("inserts a row into team_stats_snapshots", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = { match_id: "m1", team: "home" as const, form: "WWDLW", injuries: [], last_matches: [] };

    await insertTeamStatsSnapshot({ from } as any, row);

    expect(from).toHaveBeenCalledWith("team_stats_snapshots");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertTeamStatsSnapshot({ from } as any, { match_id: "m1", team: "home", form: null, injuries: [], last_matches: [] }),
    ).rejects.toThrow("boom");
  });
});

import { getLatestTeamStats } from "./team-stats";

describe("getLatestTeamStats", () => {
  it("returns the most recent snapshot per team, newest first per team", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { team: "home", form: "WWDLW", injuries: [], cards: [], last_matches: [], fetched_at: "2026-09-13T12:00:00Z" },
        { team: "away", form: "LLDWW", injuries: [{ p: 1 }], cards: [], last_matches: [], fetched_at: "2026-09-13T11:00:00Z" },
        { team: "home", form: "OLD", injuries: [], cards: [], last_matches: [], fetched_at: "2026-09-12T12:00:00Z" },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestTeamStats({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("team_stats_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual([
      { team: "home", form: "WWDLW", injuries: [], cards: [], lastMatches: [], fetchedAt: "2026-09-13T12:00:00Z" },
      { team: "away", form: "LLDWW", injuries: [{ p: 1 }], cards: [], lastMatches: [], fetchedAt: "2026-09-13T11:00:00Z" },
    ]);
  });

  it("returns an empty array when no snapshots exist", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestTeamStats({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestTeamStats({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
