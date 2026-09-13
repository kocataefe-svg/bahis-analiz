import { describe, it, expect, vi } from "vitest";
import { insertOddsSnapshots } from "./odds";

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

import { getLatestOdds } from "./odds";

describe("getLatestOdds", () => {
  it("returns only the rows from the most recent fetch batch", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
        { outcome: "Draw", bookmaker: "pinnacle", price: 3.6, fetched_at: "2026-09-13T12:00:00Z" },
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-12T12:00:00Z" },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual([
      { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetchedAt: "2026-09-13T12:00:00Z" },
      { outcome: "Draw", bookmaker: "pinnacle", price: 3.6, fetchedAt: "2026-09-13T12:00:00Z" },
    ]);
  });

  it("returns an empty array when no odds snapshots exist", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestOdds({ from } as any, "m1")).rejects.toThrow("boom");
  });
});

import { getOddsHistory } from "./odds";

describe("getOddsHistory", () => {
  it("returns the full snapshot history for a match, oldest first", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-12T12:00:00Z" },
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
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
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9 },
      { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
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
