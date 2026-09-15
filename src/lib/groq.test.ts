import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMatchAnalysis, GROQ_MODEL } from "./groq";

const minimalInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  researchContext: null,
  odds: [],
};

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }),
  );
}

function validAnalysisContent() {
  return JSON.stringify({
    team_analyst_text: "takim analizi",
    betting_analyst_text: "bahis analizi",
    commentator_text: "yorum",
    surprise_pick_text: "surpriz tahmin",
    summary_text: "ozet",
  });
}

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("generateMatchAnalysis", () => {
  it("calls the Groq chat completions endpoint with the configured model and returns parsed fields", async () => {
    mockFetchOnce({ choices: [{ message: { content: validAnalysisContent() } }] });

    const result = await generateMatchAnalysis(minimalInput);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.model).toBe(GROQ_MODEL);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("low");
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(1024);
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      teamAnalystText: "takim analizi",
      bettingAnalystText: "bahis analizi",
      commentatorText: "yorum",
      surprisePickText: "surpriz tahmin",
      summaryText: "ozet",
    });
  });

  it("returns null when the request fails", async () => {
    mockFetchOnce({ error: "boom" }, false, 500);
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("retries once after a 429 rate-limit, waiting the server-suggested time, and succeeds", async () => {
    const rateLimitBody = {
      error: { message: "Rate limit reached ... Please try again in 0.001s.", type: "tokens" },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify(rateLimitBody),
        json: async () => rateLimitBody,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: validAnalysisContent() } }] }),
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateMatchAnalysis(minimalInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.summaryText).toBe("ozet");
  });

  it("gives up (returns null) if the retry also hits a 429", async () => {
    const rateLimitBody = { error: { message: "Please try again in 0.001s.", type: "tokens" } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify(rateLimitBody),
      json: async () => rateLimitBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateMatchAnalysis(minimalInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeNull();
  });

  it("returns null when fetch rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response has no message content", async () => {
    mockFetchOnce({ choices: [{ message: {} }] });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response content is missing a required field", async () => {
    mockFetchOnce({ choices: [{ message: { content: JSON.stringify({ team_analyst_text: "x" }) } }] });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response content is not valid JSON", async () => {
    mockFetchOnce({ choices: [{ message: { content: "not json" } }] });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("throws when GROQ_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(generateMatchAnalysis(minimalInput)).rejects.toThrow();
  });
});
