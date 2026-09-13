import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/team-stats", () => ({ insertTeamStatsSnapshot: vi.fn() }));
vi.mock("@/lib/api-football", () => ({ getRecentFixtures: vi.fn(), getInjuriesForFixture: vi.fn() }));

import { POST } from "./route";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertTeamStatsSnapshot } from "@/lib/db/team-stats";
import { getRecentFixtures, getInjuriesForFixture } from "@/lib/api-football";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/stats", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(insertTeamStatsSnapshot).mockReset().mockResolvedValue(undefined);
  vi.mocked(getRecentFixtures).mockReset();
  vi.mocked(getInjuriesForFixture).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/stats", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("inserts a home and away snapshot per upcoming match", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([
      {
        id: "m1",
        apiFixtureId: 1001,
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
        kickoffAt: "2026-09-20T15:00:00Z",
      },
    ]);
    vi.mocked(getRecentFixtures).mockImplementation(async (teamId: number) => [
      { apiFixtureId: 1, date: "2026-09-01", opponent: "X", goalsFor: 1, goalsAgainst: 0, result: teamId === 50 ? "W" : "L" },
    ]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(insertTeamStatsSnapshot).toHaveBeenCalledTimes(2);
    expect(insertTeamStatsSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ match_id: "m1", team: "home", form: "W" }),
    );
    expect(insertTeamStatsSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ match_id: "m1", team: "away", form: "L" }),
    );
  });
});
