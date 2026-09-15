import { describe, it, expect, vi } from "vitest";
import {
  insertAiAnalysis,
  getLatestAnalysisGeneratedAt,
  needsFreshAnalysis,
  getLatestAnalysis,
  getLatestAnalysesByMatchIds,
} from "./ai-analyses";

describe("insertAiAnalysis", () => {
  it("inserts a row into ai_analyses", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = {
      match_id: "m1",
      team_analyst_text: "a",
      betting_analyst_text: "b",
      commentator_text: "c",
      surprise_pick_text: "e",
      summary_text: "d",
      model_used: "openai/gpt-oss-20b",
      team_analyst_pick: { market: "h2h", outcome: "Arsenal", price: 1.8 },
      commentator_pick: null,
      betting_analyst_pick: null,
      surprise_combo_pick: null,
    };

    await insertAiAnalysis({ from } as any, row);

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertAiAnalysis({ from } as any, {
        match_id: "m1",
        team_analyst_text: "a",
        betting_analyst_text: "b",
        commentator_text: "c",
        surprise_pick_text: "e",
        summary_text: "d",
        model_used: "openai/gpt-oss-20b",
        team_analyst_pick: null,
        commentator_pick: null,
        betting_analyst_pick: null,
        surprise_combo_pick: null,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("getLatestAnalysisGeneratedAt", () => {
  it("returns the most recent generated_at for the match", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ generated_at: "2026-09-13T10:00:00Z" }], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysisGeneratedAt({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toBe("2026-09-13T10:00:00Z");
  });

  it("returns null when no analysis exists yet", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysisGeneratedAt({ from } as any, "m1");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestAnalysisGeneratedAt({ from } as any, "m1")).rejects.toThrow("boom");
  });
});

describe("needsFreshAnalysis", () => {
  it("is true when no analysis exists yet, regardless of data timestamp", () => {
    expect(needsFreshAnalysis(null, null)).toBe(true);
    expect(needsFreshAnalysis(null, "2026-09-13T10:00:00Z")).toBe(true);
  });

  it("is false when an analysis exists and there is no newer data", () => {
    expect(needsFreshAnalysis("2026-09-13T10:00:00Z", null)).toBe(false);
    expect(needsFreshAnalysis("2026-09-13T10:00:00Z", "2026-09-13T09:00:00Z")).toBe(false);
  });

  it("is true when the latest data is newer than the last analysis", () => {
    expect(needsFreshAnalysis("2026-09-13T10:00:00Z", "2026-09-13T11:00:00Z")).toBe(true);
  });
});

describe("getLatestAnalysis", () => {
  it("returns the most recent full analysis for the match", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          team_analyst_text: "takim analizi",
          betting_analyst_text: "bahis analizi",
          commentator_text: "yorum",
          surprise_pick_text: "surpriz tahmin",
          summary_text: "ozet",
          model_used: "openai/gpt-oss-20b",
          generated_at: "2026-09-13T10:00:00Z",
          team_analyst_pick: { market: "h2h", outcome: "Arsenal", price: 1.8 },
          commentator_pick: null,
          betting_analyst_pick: null,
          surprise_combo_pick: { market: "btts_h1", outcome: "Yes", price: 4.42 },
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysis({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual({
      teamAnalystText: "takim analizi",
      bettingAnalystText: "bahis analizi",
      commentatorText: "yorum",
      surprisePickText: "surpriz tahmin",
      summaryText: "ozet",
      modelUsed: "openai/gpt-oss-20b",
      generatedAt: "2026-09-13T10:00:00Z",
      teamAnalystPick: { market: "h2h", outcome: "Arsenal", price: 1.8 },
      commentatorPick: null,
      bettingAnalystPick: null,
      surpriseComboPick: { market: "btts_h1", outcome: "Yes", price: 4.42 },
    });
  });

  it("returns null when no analysis exists yet", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getLatestAnalysis({ from } as any, "m1");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getLatestAnalysis({ from } as any, "m1")).rejects.toThrow("boom");
  });
});

describe("getLatestAnalysesByMatchIds", () => {
  it("returns an empty map without querying when matchIds is empty", async () => {
    const from = vi.fn();
    const result = await getLatestAnalysesByMatchIds({ from } as any, []);
    expect(result).toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps only the newest row per match_id (rows ordered generated_at desc)", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          match_id: "m1",
          team_analyst_text: "yeni",
          betting_analyst_text: "b",
          commentator_text: "c",
          surprise_pick_text: "e",
          summary_text: "d",
          model_used: "openai/gpt-oss-20b",
          generated_at: "2026-09-14T10:00:00Z",
          team_analyst_pick: { market: "h2h", outcome: "Arsenal", price: 1.8 },
          commentator_pick: null,
          betting_analyst_pick: null,
          surprise_combo_pick: null,
        },
        {
          match_id: "m1",
          team_analyst_text: "eski",
          betting_analyst_text: "b",
          commentator_text: "c",
          surprise_pick_text: "e",
          summary_text: "d",
          model_used: "openai/gpt-oss-20b",
          generated_at: "2026-09-13T10:00:00Z",
          team_analyst_pick: null,
          commentator_pick: null,
          betting_analyst_pick: null,
          surprise_combo_pick: null,
        },
      ],
      error: null,
    });
    const inFn = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysesByMatchIds({ from } as any, ["m1"]);

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(inFn).toHaveBeenCalledWith("match_id", ["m1"]);
    expect(result.get("m1")?.teamAnalystText).toBe("yeni");
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const inFn = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));
    await expect(getLatestAnalysesByMatchIds({ from } as any, ["m1"])).rejects.toThrow("boom");
  });
});
