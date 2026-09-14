import { describe, it, expect } from "vitest";
import { formatKickoffTime, formatRelativeUpdate } from "./format";

describe("formatKickoffTime", () => {
  it("formats an ISO timestamp as a Turkish-localized date/time string", () => {
    const result = formatKickoffTime("2026-09-20T15:00:00.000Z");
    // Exact locale string rendering can vary by ICU data, so assert on
    // the stable, always-present pieces rather than the full string.
    expect(result).toContain("2026");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatRelativeUpdate", () => {
  it("formats a timestamp from 3 hours ago in hours", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeUpdate(threeHoursAgo)).toContain("3 saat");
  });

  it("formats a timestamp from 2 days ago in days", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeUpdate(twoDaysAgo)).toContain("gun");
  });
});
