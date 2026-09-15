import { describe, it, expect, vi } from "vitest";
import { insertMatchResult, getMatchResultsByIds, getAllMatchResults } from "./match-results";

describe("insertMatchResult", () => {
  it("upserts the result with match_id as the conflict key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    await insertMatchResult({ from } as any, { match_id: "m1", home_score: 2, away_score: 1 });
    expect(from).toHaveBeenCalledWith("match_results");
    expect(upsert).toHaveBeenCalledWith(
      { match_id: "m1", home_score: 2, away_score: 1 },
      { onConflict: "match_id" },
    );
  });

  it("throws when the upsert fails", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ upsert }));
    await expect(
      insertMatchResult({ from } as any, { match_id: "m1", home_score: 2, away_score: 1 }),
    ).rejects.toThrow("boom");
  });
});

describe("getMatchResultsByIds", () => {
  it("returns an empty map without querying when matchIds is empty", async () => {
    const from = vi.fn();
    const result = await getMatchResultsByIds({ from } as any, []);
    expect(result).toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });

  it("returns a map keyed by match_id", async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        { match_id: "m1", home_score: 2, away_score: 1 },
        { match_id: "m2", home_score: 0, away_score: 0 },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchResultsByIds({ from } as any, ["m1", "m2"]);

    expect(from).toHaveBeenCalledWith("match_results");
    expect(inFn).toHaveBeenCalledWith("match_id", ["m1", "m2"]);
    expect(result.get("m1")).toEqual({ matchId: "m1", homeScore: 2, awayScore: 1 });
    expect(result.get("m2")).toEqual({ matchId: "m2", homeScore: 0, awayScore: 0 });
  });

  it("throws when the query fails", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchResultsByIds({ from } as any, ["m1"])).rejects.toThrow("boom");
  });
});

describe("getAllMatchResults", () => {
  it("returns all stored results mapped to camelCase", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ match_id: "m1", home_score: 2, away_score: 1 }],
      error: null,
    });
    const from = vi.fn(() => ({ select }));
    const result = await getAllMatchResults({ from } as any);
    expect(from).toHaveBeenCalledWith("match_results");
    expect(result).toEqual([{ matchId: "m1", homeScore: 2, awayScore: 1 }]);
  });

  it("throws when the query fails", async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const from = vi.fn(() => ({ select }));
    await expect(getAllMatchResults({ from } as any)).rejects.toThrow("boom");
  });
});
