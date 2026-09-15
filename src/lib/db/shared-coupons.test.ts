import { describe, it, expect, vi } from "vitest";
import { insertSharedCoupon, getSharedCoupons } from "./shared-coupons";

describe("insertSharedCoupon", () => {
  it("inserts a row into shared_coupons", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = {
      user_name: "Volkan",
      picks: [{ matchId: "m1", matchLabel: "Arsenal - Chelsea", market: "h2h", outcome: "Arsenal", price: 1.8 }],
      total_odds: 1.8,
    };

    await insertSharedCoupon({ from } as any, row);

    expect(from).toHaveBeenCalledWith("shared_coupons");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertSharedCoupon({ from } as any, { user_name: "Volkan", picks: [], total_odds: 1 }),
    ).rejects.toThrow("boom");
  });
});

describe("getSharedCoupons", () => {
  it("returns coupons mapped to camelCase, newest first", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "c1",
          user_name: "Volkan",
          picks: [{ matchId: "m1", matchLabel: "Arsenal - Chelsea", market: "h2h", outcome: "Arsenal", price: 1.8 }],
          total_odds: 1.8,
          created_at: "2026-09-14T10:00:00Z",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));

    const result = await getSharedCoupons({ from } as any);

    expect(from).toHaveBeenCalledWith("shared_coupons");
    expect(result).toEqual([
      {
        id: "c1",
        userName: "Volkan",
        picks: [{ matchId: "m1", matchLabel: "Arsenal - Chelsea", market: "h2h", outcome: "Arsenal", price: 1.8 }],
        totalOdds: 1.8,
        createdAt: "2026-09-14T10:00:00Z",
      },
    ]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    await expect(getSharedCoupons({ from } as any)).rejects.toThrow("boom");
  });
});
