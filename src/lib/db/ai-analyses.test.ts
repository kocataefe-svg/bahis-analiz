import { describe, it, expect, vi } from "vitest";
import { insertAiAnalysis, getLatestAnalysisGeneratedAt, needsFreshAnalysis } from "./ai-analyses";

describe("insertAiAnalysis", () => {
  it("inserts a row into ai_analyses", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = {
      match_id: "m1",
      team_analyst_text: "a",
      betting_analyst_text: "b",
      commentator_text: "c",
      summary_text: "d",
      model_used: "gemini-3.5-flash-lite",
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
        summary_text: "d",
        model_used: "gemini-3.5-flash-lite",
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
