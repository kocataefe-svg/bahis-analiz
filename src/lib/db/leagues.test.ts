import { describe, it, expect, vi } from "vitest";
import { getActiveLeagues } from "./leagues";

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq } as any;
}

describe("getActiveLeagues", () => {
  it("maps rows to camelCase and filters by active=true", async () => {
    const supabase = createSupabaseMock({
      data: [
        { id: "l1", api_football_id: 39, current_season: 2026, odds_api_sport_key: "soccer_epl" },
        { id: "l2", api_football_id: 204, current_season: null, odds_api_sport_key: null },
      ],
      error: null,
    });

    const result = await getActiveLeagues(supabase);

    expect(supabase.from).toHaveBeenCalledWith("leagues");
    expect(supabase.eq).toHaveBeenCalledWith("active", true);
    expect(result).toEqual([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 204, currentSeason: null, oddsApiSportKey: null },
    ]);
  });

  it("throws when the query fails", async () => {
    const supabase = createSupabaseMock({ data: null, error: { message: "boom" } });
    await expect(getActiveLeagues(supabase)).rejects.toThrow("boom");
  });
});
