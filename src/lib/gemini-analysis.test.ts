import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { interactions: { create: mockCreate } };
  }),
}));

import { generateBettingAndSurpriseAnalysis, GEMINI_ANALYSIS_MODEL } from "./gemini-analysis";

const minimalInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  researchContext: null,
  odds: [],
};

function validContent() {
  return JSON.stringify({
    betting_analyst_text: "bahis analizi",
    surprise_pick_text: "surpriz tahmin",
  });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateBettingAndSurpriseAnalysis", () => {
  it("calls the Gemini SDK with the configured model and returns parsed fields", async () => {
    mockCreate.mockResolvedValue({ output_text: validContent() });

    const result = await generateBettingAndSurpriseAnalysis(minimalInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: GEMINI_ANALYSIS_MODEL,
        input: expect.any(String),
      }),
    );
    expect(result).toEqual({
      bettingAnalystText: "bahis analizi",
      surprisePickText: "surpriz tahmin",
      bettingAnalystPick: null,
      surpriseComboPick: null,
    });
  });

  it("parses valid betting_analyst_pick/surprise_combo_pick fields, and drops malformed ones to null", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        betting_analyst_text: "bahis analizi",
        surprise_pick_text: "surpriz tahmin",
        betting_analyst_pick: { market: "totals", outcome: "Over 2.5" },
        surprise_combo_pick: { market: "totals" },
      }),
    });

    const result = await generateBettingAndSurpriseAnalysis(minimalInput);

    expect(result?.bettingAnalystPick).toEqual({ market: "totals", outcome: "Over 2.5" });
    expect(result?.surpriseComboPick).toBeNull();
  });

  it("returns null when the SDK call throws (rate limit/network)", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));
    const result = await generateBettingAndSurpriseAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response is missing a required field", async () => {
    mockCreate.mockResolvedValue({ output_text: JSON.stringify({ betting_analyst_text: "x" }) });
    const result = await generateBettingAndSurpriseAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response is not valid JSON", async () => {
    mockCreate.mockResolvedValue({ output_text: "not json" });
    const result = await generateBettingAndSurpriseAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when output_text is empty", async () => {
    mockCreate.mockResolvedValue({ output_text: "" });
    const result = await generateBettingAndSurpriseAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(generateBettingAndSurpriseAnalysis(minimalInput)).rejects.toThrow();
  });
});
