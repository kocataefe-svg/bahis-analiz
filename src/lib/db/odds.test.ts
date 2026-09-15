import { describe, it, expect, vi } from "vitest";
import { insertOddsSnapshots, getLatestOdds, getOddsHistory } from "./odds";

describe("insertOddsSnapshots", () => {
  it("does nothing when rows is empty", async () => {
    const insert = vi.fn();
    const from = vi.fn(() => ({ insert }));
    await insertOddsSnapshots({ from } as any, []);
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts rows into odds_snapshots", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const rows = [{ match_id: "m1", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 2.1 }];
    await insertOddsSnapshots({ from } as any, rows);
    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(insert).toHaveBeenCalledWith(rows);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertOddsSnapshots({ from } as any, [{ match_id: "m1", market: "h2h", outcome: "A", bookmaker: "b", price: 1 }]),
    ).rejects.toThrow("boom");
  });
});

describe("getLatestOdds", () => {
  it("returns only the rows from the most recent fetch batch, per market", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
        { market: "h2h", outcome: "Draw", bookmaker: "pinnacle", price: 3.6, fetched_at: "2026-09-13T12:00:00Z" },
        { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-12T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual([
      { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetchedAt: "2026-09-13T12:00:00Z" },
      { market: "h2h", outcome: "Draw", bookmaker: "pinnacle", price: 3.6, fetchedAt: "2026-09-13T12:00:00Z" },
    ]);
  });

  it("keeps each market's own latest batch when markets were fetched at different times", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        // odds_snapshots ordered fetched_at desc: totals (fetched later, on-demand) first, then h2h (daily sync)
        { market: "totals", outcome: "Over 2.5", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-14T09:00:00Z" },
        { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
        { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.85, fetched_at: "2026-09-12T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");

    expect(result).toEqual([
      { market: "totals", outcome: "Over 2.5", bookmaker: "pinnacle", price: 1.9, fetchedAt: "2026-09-14T09:00:00Z" },
      { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetchedAt: "2026-09-13T12:00:00Z" },
    ]);
  });

  it("returns an empty array when no odds snapshots exist", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestOdds({ from } as any, "m1")).rejects.toThrow("boom");
  });
});

describe("getOddsHistory", () => {
  it("returns the full snapshot history for a match, oldest first", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-12T12:00:00Z" },
        { market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getOddsHistory({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(order).toHaveBeenCalledWith("fetched_at", { ascending: true });
    expect(result).toEqual([
      { fetchedAt: "2026-09-12T12:00:00Z", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9 },
      { fetchedAt: "2026-09-13T12:00:00Z", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
    ]);
  });

  it("returns an empty array when no history exists", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getOddsHistory({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getOddsHistory({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
