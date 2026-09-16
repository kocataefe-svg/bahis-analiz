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

  it("returns an unknown failure when the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "", candidates: [] });
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ reason: "unknown" });
  });

  it("returns an unknown failure when the SDK call throws a non-quota error", async () => {
    mockGenerateContent.mockRejectedValue(new Error("network down"));
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ reason: "unknown" });
  });

  it("returns a quota failure when the SDK throws a 429 RESOURCE_EXHAUSTED error", async () => {
    const quotaError = Object.assign(
      new Error('{"error":{"code":429,"message":"quota exceeded","status":"RESOURCE_EXHAUSTED"}}'),
      { status: 429 },
    );
    mockGenerateContent.mockRejectedValue(quotaError);
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ reason: "quota" });
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(researchMatchContext(minimalInput)).rejects.toThrow();
  });

  it("falls back to a second GEMINI_API_KEYS entry when the first is quota-exhausted", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    const quotaError = Object.assign(new Error('{"status":"RESOURCE_EXHAUSTED"}'), { status: 429 });
    mockGenerateContent.mockRejectedValueOnce(quotaError).mockResolvedValueOnce({
      text: "ikinci anahtardan sonuc",
      candidates: [],
    });

    const result = await researchMatchContext(minimalInput);

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ content: "ikinci anahtardan sonuc", sources: [] });
  });
});
