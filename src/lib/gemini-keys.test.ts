import { describe, it, expect, vi, afterEach } from "vitest";
import { getGeminiApiKeys, isQuotaExhaustedError, callWithGeminiKeyFallback } from "./gemini-keys";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getGeminiApiKeys", () => {
  it("splits GEMINI_API_KEYS on commas and trims whitespace", () => {
    vi.stubEnv("GEMINI_API_KEYS", " key1, key2 ,key3");
    expect(getGeminiApiKeys()).toEqual(["key1", "key2", "key3"]);
  });

  it("falls back to the single GEMINI_API_KEY when GEMINI_API_KEYS is not set", () => {
    vi.stubEnv("GEMINI_API_KEY", "solo-key");
    expect(getGeminiApiKeys()).toEqual(["solo-key"]);
  });

  it("prefers GEMINI_API_KEYS over GEMINI_API_KEY when both are set", () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    vi.stubEnv("GEMINI_API_KEY", "solo-key");
    expect(getGeminiApiKeys()).toEqual(["key1", "key2"]);
  });

  it("throws when neither env var is set", () => {
    expect(() => getGeminiApiKeys()).toThrow();
  });

  it("throws when GEMINI_API_KEYS is set but empty after trimming", () => {
    vi.stubEnv("GEMINI_API_KEYS", " , ,");
    expect(() => getGeminiApiKeys()).toThrow();
  });
});

describe("isQuotaExhaustedError", () => {
  it("recognizes a 429 status", () => {
    expect(isQuotaExhaustedError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
  });

  it("recognizes a RESOURCE_EXHAUSTED message", () => {
    expect(isQuotaExhaustedError(new Error('{"status":"RESOURCE_EXHAUSTED"}'))).toBe(true);
  });

  it("returns false for an unrelated error", () => {
    expect(isQuotaExhaustedError(new Error("network down"))).toBe(false);
  });
});

describe("callWithGeminiKeyFallback", () => {
  it("returns the value on first-key success without trying other keys", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    const attempt = vi.fn().mockResolvedValue("ok");

    const result = await callWithGeminiKeyFallback(attempt);

    expect(result).toEqual({ ok: true, value: "ok" });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith("key1");
  });

  it("falls back to the next key when the first hits a quota error", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    const quotaError = Object.assign(new Error("quota"), { status: 429 });
    const attempt = vi.fn().mockRejectedValueOnce(quotaError).mockResolvedValueOnce("ok-from-key2");

    const result = await callWithGeminiKeyFallback(attempt);

    expect(result).toEqual({ ok: true, value: "ok-from-key2" });
    expect(attempt).toHaveBeenNthCalledWith(1, "key1");
    expect(attempt).toHaveBeenNthCalledWith(2, "key2");
  });

  it("returns a quota failure once every key is exhausted", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    const quotaError = Object.assign(new Error("quota"), { status: 429 });
    const attempt = vi.fn().mockRejectedValue(quotaError);

    const result = await callWithGeminiKeyFallback(attempt);

    expect(result).toEqual({ ok: false, reason: "quota" });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on a non-quota error without trying other keys", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    const attempt = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await callWithGeminiKeyFallback(attempt);

    expect(result).toEqual({ ok: false, reason: "unknown" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("propagates the missing-key-configuration error", async () => {
    const attempt = vi.fn();
    await expect(callWithGeminiKeyFallback(attempt)).rejects.toThrow();
    expect(attempt).not.toHaveBeenCalled();
  });
});
