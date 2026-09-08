import { describe, it, expect, vi, afterEach } from "vitest";
import { getSupabaseClient } from "./supabase";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseClient", () => {
  it("throws when SUPABASE_URL is missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("returns a client with a .from method when both env vars are set", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const client = getSupabaseClient();
    expect(typeof client.from).toBe("function");
  });
});
