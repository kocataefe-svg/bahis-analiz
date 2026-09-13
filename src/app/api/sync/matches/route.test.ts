import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/matches", () => ({ upsertMatches: vi.fn() }));
vi.mock("@/lib/api-football", () => ({ getUpcomingFixtures: vi.fn() }));

import { POST } from "./route";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches } from "@/lib/db/matches";
import { getUpcomingFixtures } from "@/lib/api-football";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/matches", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getActiveLeagues).mockReset();
  vi.mocked(upsertMatches).mockReset().mockResolvedValue(undefined);
  vi.mocked(getUpcomingFixtures).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/matches", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
    expect(getActiveLeagues).not.toHaveBeenCalled();
  });

  it("fetches fixtures for each league with a known season and upserts them", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 204, currentSeason: null, oddsApiSportKey: null },
    ]);
    vi.mocked(getUpcomingFixtures).mockResolvedValue([
      {
        apiFixtureId: 1001,
        kickoffAt: "2026-09-20T15:00:00Z",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
      },
    ]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getUpcomingFixtures).toHaveBeenCalledTimes(1);
    expect(getUpcomingFixtures).toHaveBeenCalledWith(39, 2026, expect.any(String), expect.any(String));
    expect(upsertMatches).toHaveBeenCalledWith(expect.anything(), [
      {
        league_id: "l1",
        api_football_fixture_id: 1001,
        home_team: "Manchester City",
        away_team: "Arsenal",
        home_team_api_id: 50,
        away_team_api_id: 42,
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ]);
    expect(body.totalUpserted).toBe(1);
  });

  it("continues to the next league and reports a failure count when upsertMatches throws for one league", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 61, currentSeason: 2026, oddsApiSportKey: "soccer_france_ligue_one" },
    ]);
    vi.mocked(getUpcomingFixtures).mockResolvedValue([
      {
        apiFixtureId: 1001,
        kickoffAt: "2026-09-20T15:00:00Z",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
      },
    ]);
    vi.mocked(upsertMatches).mockReset().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(upsertMatches).toHaveBeenCalledTimes(2);
    expect(body.totalUpserted).toBe(1);
    expect(body.failed).toBe(1);
  });
});
