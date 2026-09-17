import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchWeb } from "./tavily";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }),
  );
}

beforeEach(() => {
  vi.stubEnv("TAVILY_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchWeb", () => {
  it("calls the Tavily search endpoint and returns mapped results", async () => {
    mockFetchOnce({
      results: [{ title: "Ornek Kaynak", url: "https://example.com/a", content: "icerik" }],
    });

    const result = await searchWeb("Arsenal vs Chelsea");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" }),
    );
    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.api_key).toBe("test-key");
    expect(body.query).toBe("Arsenal vs Chelsea");

    expect(result).toEqual({
      ok: true,
      results: [{ title: "Ornek Kaynak", url: "https://example.com/a", content: "icerik" }],
    });
  });

  it("returns an empty results array when Tavily has no matches", async () => {
    mockFetchOnce({ results: [] });
    const result = await searchWeb("belirsiz sorgu");
    expect(result).toEqual({ ok: true, results: [] });
  });

  it("drops results missing a url", async () => {
    mockFetchOnce({ results: [{ title: "url yok", content: "x" }, { title: "gecerli", url: "https://a.com", content: "y" }] });
    const result = await searchWeb("sorgu");
    expect(result).toEqual({ ok: true, results: [{ title: "gecerli", url: "https://a.com", content: "y" }] });
  });

  it("returns a quota failure on a 429 response", async () => {
    mockFetchOnce({ error: "rate limited" }, false, 429);
    const result = await searchWeb("sorgu");
    expect(result).toEqual({ ok: false, reason: "quota" });
  });

  it("returns a quota failure on a 432 (plan limit) response", async () => {
    mockFetchOnce({ error: "plan limit" }, false, 432);
    const result = await searchWeb("sorgu");
    expect(result).toEqual({ ok: false, reason: "quota" });
  });

  it("returns an unknown failure on other error statuses", async () => {
    mockFetchOnce({ error: "boom" }, false, 500);
    const result = await searchWeb("sorgu");
    expect(result).toEqual({ ok: false, reason: "unknown" });
  });

  it("returns an unknown failure when fetch rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await searchWeb("sorgu");
    expect(result).toEqual({ ok: false, reason: "unknown" });
  });

  it("throws when TAVILY_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(searchWeb("sorgu")).rejects.toThrow();
  });
});
