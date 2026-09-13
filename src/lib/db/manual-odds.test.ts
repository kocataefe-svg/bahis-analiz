import { describe, it, expect, vi } from "vitest";
import { insertManualOdds, getManualOddsForMatch } from "./manual-odds";

describe("insertManualOdds", () => {
  it("inserts a row into manual_odds", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = { match_id: "m1", entered_by: "Ali", market: "h2h", outcome: "Arsenal", price: 1.85 };

    await insertManualOdds({ from } as any, row);

    expect(from).toHaveBeenCalledWith("manual_odds");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertManualOdds({ from } as any, {
        match_id: "m1",
        entered_by: "Ali",
        market: "h2h",
        outcome: "Arsenal",
        price: 1.85,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("getManualOddsForMatch", () => {
  it("returns entries for the match, newest first", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "e1", entered_by: "Ali", outcome: "Arsenal", price: 1.85, entered_at: "2026-09-13T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getManualOddsForMatch({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("manual_odds");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(order).toHaveBeenCalledWith("entered_at", { ascending: false });
    expect(result).toEqual([
      { id: "e1", enteredBy: "Ali", outcome: "Arsenal", price: 1.85, enteredAt: "2026-09-13T12:00:00Z" },
    ]);
  });

  it("returns an empty array when no entries exist", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getManualOddsForMatch({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getManualOddsForMatch({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
