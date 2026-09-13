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

import { getActiveLeaguesForDisplay, getLeagueById } from "./leagues";

describe("getActiveLeaguesForDisplay", () => {
  it("returns id/name/country for active leagues, ordered by name", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "l1", name: "Premier League", country: "England" },
        { id: "l2", name: "Süper Lig", country: "Turkey" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getActiveLeaguesForDisplay({ from } as any);

    expect(from).toHaveBeenCalledWith("leagues");
    expect(eq).toHaveBeenCalledWith("active", true);
    expect(result).toEqual([
      { id: "l1", name: "Premier League", country: "England" },
      { id: "l2", name: "Süper Lig", country: "Turkey" },
    ]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getActiveLeaguesForDisplay({ from } as any)).rejects.toThrow("boom");
  });
});

describe("getLeagueById", () => {
  it("returns the league when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "l1", name: "Premier League", country: "England" },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLeagueById({ from } as any, "l1");

    expect(from).toHaveBeenCalledWith("leagues");
    expect(eq).toHaveBeenCalledWith("id", "l1");
    expect(result).toEqual({ id: "l1", name: "Premier League", country: "England" });
  });

  it("returns null when not found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getLeagueById({ from } as any, "missing");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getLeagueById({ from } as any, "l1")).rejects.toThrow("boom");
  });
});
