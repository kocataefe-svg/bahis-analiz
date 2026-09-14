import { describe, it, expect, vi } from "vitest";
import { insertMatchResearch, getMatchResearch } from "./match-research";

describe("insertMatchResearch", () => {
  it("inserts a row into match_research", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = {
      match_id: "m1",
      content: "arastirma metni",
      sources: [{ url: "https://example.com", title: "Kaynak" }],
      model_used: "gemini-3.5-flash-lite",
    };
    await insertMatchResearch({ from } as any, row);
    expect(from).toHaveBeenCalledWith("match_research");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertMatchResearch({ from } as any, {
        match_id: "m1",
        content: "x",
        sources: [],
        model_used: "gemini-3.5-flash-lite",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("getMatchResearch", () => {
  it("returns the research record when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        content: "arastirma metni",
        sources: [{ url: "https://example.com", title: "Kaynak" }],
        model_used: "gemini-3.5-flash-lite",
        generated_at: "2026-09-14T10:00:00Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchResearch({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("match_research");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual({
      content: "arastirma metni",
      sources: [{ url: "https://example.com", title: "Kaynak" }],
      modelUsed: "gemini-3.5-flash-lite",
      generatedAt: "2026-09-14T10:00:00Z",
    });
  });

  it("returns null when not found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getMatchResearch({ from } as any, "missing");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchResearch({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
