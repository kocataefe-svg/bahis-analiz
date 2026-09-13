import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { interactions: { create: mockCreate } };
  }),
}));

import { generateMatchAnalysis, GEMINI_MODEL } from "./gemini";

const minimalInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  homeStats: null,
  awayStats: null,
  odds: [],
};

function validAnalysisJson() {
  return JSON.stringify({
    team_analyst_text: "takim analizi",
    betting_analyst_text: "bahis analizi",
    commentator_text: "yorum",
    summary_text: "ozet",
  });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateMatchAnalysis", () => {
  it("calls the Gemini SDK with the configured model and returns parsed fields", async () => {
    mockCreate.mockResolvedValue({ output_text: validAnalysisJson() });

    const result = await generateMatchAnalysis(minimalInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: GEMINI_MODEL,
        input: expect.any(String),
      }),
    );
    expect(result).toEqual({
      teamAnalystText: "takim analizi",
      bettingAnalystText: "bahis analizi",
      commentatorText: "yorum",
      summaryText: "ozet",
    });
  });

  it("returns null when the SDK call throws (rate limit/network)", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response JSON is missing a required field", async () => {
    mockCreate.mockResolvedValue({ output_text: JSON.stringify({ team_analyst_text: "x" }) });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response is not valid JSON", async () => {
    mockCreate.mockResolvedValue({ output_text: "not json" });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(generateMatchAnalysis(minimalInput)).rejects.toThrow();
  });
});
