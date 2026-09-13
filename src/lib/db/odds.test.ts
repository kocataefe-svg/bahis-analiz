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
