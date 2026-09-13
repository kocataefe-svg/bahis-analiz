import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ insertOddsSnapshots: vi.fn() }));
vi.mock("@/lib/odds-api", () => ({ getOddsForSport: vi.fn() }));

import { POST } from "./route";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertOddsSnapshots } from "@/lib/db/odds";
import { getOddsForSport } from "@/lib/odds-api";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/odds", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getActiveLeagues).mockReset();
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(insertOddsSnapshots).mockReset().mockResolvedValue(undefined);
  vi.mocked(getOddsForSport).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/odds", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("matches odds events to known matches by normalized team names and inserts them", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 204, currentSeason: null, oddsApiSportKey: null },
    ]);
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
    vi.mocked(getOddsForSport).mockResolvedValue([
      {
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
        homeTeam: "Unknown Team A",
        awayTeam: "Unknown Team B",
        commenceTime: "2026-09-21T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Unknown Team A",
        price: 2.0,
      },
    ]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getOddsForSport).toHaveBeenCalledTimes(1);
    expect(getOddsForSport).toHaveBeenCalledWith("soccer_epl");
    expect(insertOddsSnapshots).toHaveBeenCalledWith(expect.anything(), [
      { match_id: "m1", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 4.2 },
    ]);
    expect(body.totalInserted).toBe(1);
    expect(body.totalUnmatched).toBe(1);
  });
});
