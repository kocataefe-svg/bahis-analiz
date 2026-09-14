import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { researchMatchContext, RESEARCH_MODEL } from "./gemini-research";

const minimalInput = { homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-09-20T15:00:00Z" };

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockGenerateContent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("researchMatchContext", () => {
  it("calls the Gemini SDK with google search grounding and returns text + sources", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "arastirma sonucu",
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "https://example.com/a", title: "Ornek Kaynak" } }],
          },
        },
      ],
    });

    const result = await researchMatchContext(minimalInput);

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: RESEARCH_MODEL,
        config: { tools: [{ googleSearch: {} }] },
      }),
    );
    expect(result).toEqual({
      content: "arastirma sonucu",
      sources: [{ url: "https://example.com/a", title: "Ornek Kaynak" }],
    });
  });

  it("returns an empty sources array when there is no grounding metadata", async () => {
    mockGenerateContent.mockResolvedValue({ text: "sonuc", candidates: [{}] });
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ content: "sonuc", sources: [] });
  });

  it("returns null when the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "", candidates: [] });
    const result = await researchMatchContext(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the SDK call throws", async () => {
    mockGenerateContent.mockRejectedValue(new Error("rate limited"));
    const result = await researchMatchContext(minimalInput);
    expect(result).toBeNull();
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(researchMatchContext(minimalInput)).rejects.toThrow();
  });
});
