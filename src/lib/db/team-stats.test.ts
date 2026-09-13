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
