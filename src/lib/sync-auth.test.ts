import { describe, it, expect, vi, afterEach } from "vitest";
import { isSyncRequestAuthorized } from "./sync-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/matches", { headers });
}

describe("isSyncRequestAuthorized", () => {
  it("returns false when CRON_SECRET is not set", () => {
    const req = makeRequest("Bearer anything");
    expect(isSyncRequestAuthorized(req)).toBe(false);
  });

  it("returns true when the Authorization header matches the secret", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest("Bearer my-secret");
    expect(isSyncRequestAuthorized(req)).toBe(true);
  });

  it("returns false when the Authorization header does not match", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest("Bearer wrong-secret");
    expect(isSyncRequestAuthorized(req)).toBe(false);
  });

  it("returns false when there is no Authorization header", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest();
    expect(isSyncRequestAuthorized(req)).toBe(false);
  });
});
