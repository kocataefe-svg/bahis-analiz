import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSearchWeb, mockGenerateGroqText } = vi.hoisted(() => ({
  mockSearchWeb: vi.fn(),
  mockGenerateGroqText: vi.fn(),
}));

vi.mock("./tavily", () => ({ searchWeb: mockSearchWeb }));
vi.mock("./groq", () => ({ generateGroqText: mockGenerateGroqText, GROQ_MODEL: "openai/gpt-oss-20b" }));

import { researchMatchContext } from "./web-research";

const minimalInput = { homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-09-20T15:00:00Z" };

beforeEach(() => {
  mockSearchWeb.mockReset();
  mockGenerateGroqText.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("researchMatchContext", () => {
  it("searches the web, hands the results to Groq, and returns the report + sources", async () => {
    mockSearchWeb.mockResolvedValue({
      ok: true,
      results: [{ title: "Ornek Kaynak", url: "https://example.com/a", content: "icerik" }],
    });
    mockGenerateGroqText.mockResolvedValue("arastirma raporu");

    const result = await researchMatchContext(minimalInput);

    expect(mockSearchWeb).toHaveBeenCalledWith(expect.stringContaining("Arsenal"));
    expect(mockGenerateGroqText).toHaveBeenCalledWith(expect.stringContaining("Ornek Kaynak"));
    expect(result).toEqual({
      content: "arastirma raporu",
      sources: [{ url: "https://example.com/a", title: "Ornek Kaynak" }],
    });
  });

  it("returns a quota failure when the web search is quota-exhausted", async () => {
    mockSearchWeb.mockResolvedValue({ ok: false, reason: "quota" });
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ reason: "quota" });
    expect(mockGenerateGroqText).not.toHaveBeenCalled();
  });

  it("returns an unknown failure when the web search fails for another reason", async () => {
    mockSearchWeb.mockResolvedValue({ ok: false, reason: "unknown" });
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ reason: "unknown" });
  });

  it("returns an unknown failure when Groq returns no content", async () => {
    mockSearchWeb.mockResolvedValue({ ok: true, results: [] });
    mockGenerateGroqText.mockResolvedValue(null);
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ reason: "unknown" });
  });

  it("returns an empty sources array when the search has no results", async () => {
    mockSearchWeb.mockResolvedValue({ ok: true, results: [] });
    mockGenerateGroqText.mockResolvedValue("rapor");
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ content: "rapor", sources: [] });
  });
});
