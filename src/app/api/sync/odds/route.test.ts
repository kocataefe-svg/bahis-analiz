import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/matches", () => ({ upsertMatches: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ insertOddsSnapshots: vi.fn() }));
vi.mock("@/lib/odds-api", () => ({ getOddsForSport: vi.fn() }));

import { POST } from "./route";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches } from "@/lib/db/matches";
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
  vi.mocked(upsertMatches).mockReset();
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

  it("upserts the match from the odds event and inserts odds keyed by the returned match id", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", oddsApiSportKey: "soccer_epl" },
      { id: "l2", oddsApiSportKey: null },
    ]);
    vi.mocked(getOddsForSport).mockResolvedValue([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Manchester City",
        price: 1.8,
      },
    ]);
    vi.mocked(upsertMatches).mockResolvedValue([{ id: "m1", oddsApiEventId: "evt1" }]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getOddsForSport).toHaveBeenCalledTimes(1);
    expect(getOddsForSport).toHaveBeenCalledWith("soccer_epl");
    expect(upsertMatches).toHaveBeenCalledWith(expect.anything(), [
      {
        league_id: "l1",
        odds_api_event_id: "evt1",
        home_team: "Manchester City",
        away_team: "Arsenal",
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ]);
    expect(insertOddsSnapshots).toHaveBeenCalledWith(expect.anything(), [
      { match_id: "m1", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 4.2 },
      { match_id: "m1", market: "h2h", outcome: "Manchester City", bookmaker: "pinnacle", price: 1.8 },
    ]);
    expect(body).toEqual({ ok: true, totalMatchesUpserted: 1, totalOddsInserted: 2, failed: 0 });
  });

  it("skips a league when getOddsForSport returns no quotes", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([{ id: "l1", oddsApiSportKey: "soccer_epl" }]);
    vi.mocked(getOddsForSport).mockResolvedValue([]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(upsertMatches).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, totalMatchesUpserted: 0, totalOddsInserted: 0, failed: 0 });
  });

  it("continues to the next league and reports a failure count when upsertMatches throws for one league", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", oddsApiSportKey: "soccer_epl" },
      { id: "l2", oddsApiSportKey: "soccer_france_ligue_one" },
    ]);
    vi.mocked(getOddsForSport).mockResolvedValue([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
    ]);
    vi.mocked(upsertMatches)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce([{ id: "m1", oddsApiEventId: "evt1" }]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(upsertMatches).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ ok: true, totalMatchesUpserted: 1, totalOddsInserted: 1, failed: 1 });
  });
});
