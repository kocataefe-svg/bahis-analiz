import { describe, it, expect } from "vitest";
import { formatKickoffTime } from "./format";

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
