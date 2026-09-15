import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getMatchesAwaitingResult: vi.fn() }));
vi.mock("@/lib/db/match-results", () => ({ getMatchResultsByIds: vi.fn(), insertMatchResult: vi.fn() }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/odds-api", () => ({ getScoresForSport: vi.fn() }));

import { POST } from "./route";
import { getMatchesAwaitingResult } from "@/lib/db/matches";
import { getMatchResultsByIds, insertMatchResult } from "@/lib/db/match-results";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getScoresForSport } from "@/lib/odds-api";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/results", { method: "POST", headers });
}

const match = {
  id: "m1",
  leagueId: "l1",
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T12:00:00Z",
  oddsApiEventId: "evt1",
};

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getMatchesAwaitingResult).mockReset().mockResolvedValue([match]);
  vi.mocked(getMatchResultsByIds).mockReset().mockResolvedValue(new Map());
  vi.mocked(getActiveLeagues).mockReset().mockResolvedValue([{ id: "l1", oddsApiSportKey: "soccer_epl" }]);
  vi.mocked(getScoresForSport).mockReset().mockResolvedValue([]);
  vi.mocked(insertMatchResult).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/results", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("skips matches that already have a stored result", async () => {
    vi.mocked(getMatchResultsByIds).mockResolvedValue(new Map([["m1", { matchId: "m1", homeScore: 1, awayScore: 0 }]]));
    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();
    expect(getScoresForSport).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, checked: 0, resolved: 0, failed: 0 });
  });

  it("inserts a result for a completed match with a resolved score", async () => {
    vi.mocked(getScoresForSport).mockResolvedValue([
      { eventId: "evt1", completed: true, homeScore: 2, awayScore: 1 },
    ]);
    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(getScoresForSport).toHaveBeenCalledWith("soccer_epl", ["evt1"]);
    expect(insertMatchResult).toHaveBeenCalledWith(expect.anything(), {
      match_id: "m1",
      home_score: 2,
      away_score: 1,
    });
    expect(body).toEqual({ ok: true, checked: 1, resolved: 1, failed: 0 });
  });

  it("does not insert a result for a match that is not completed yet", async () => {
    vi.mocked(getScoresForSport).mockResolvedValue([
      { eventId: "evt1", completed: false, homeScore: null, awayScore: null },
    ]);
    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(insertMatchResult).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, checked: 1, resolved: 0, failed: 0 });
  });

  it("skips a league with no odds api sport key", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([{ id: "l1", oddsApiSportKey: null }]);
    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();
    expect(getScoresForSport).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, checked: 0, resolved: 0, failed: 0 });
  });

  it("counts a league as failed when the scores fetch throws, continuing other leagues", async () => {
    const matchOtherLeague = { ...match, id: "m2", leagueId: "l2", oddsApiEventId: "evt2" };
    vi.mocked(getMatchesAwaitingResult).mockResolvedValue([match, matchOtherLeague]);
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", oddsApiSportKey: "soccer_epl" },
      { id: "l2", oddsApiSportKey: "soccer_spain_la_liga" },
    ]);
    vi.mocked(getScoresForSport).mockImplementation(async (sportKey) => {
      if (sportKey === "soccer_epl") throw new Error("boom");
      return [{ eventId: "evt2", completed: true, homeScore: 0, awayScore: 0 }];
    });

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(body).toEqual({ ok: true, checked: 1, resolved: 1, failed: 1 });
  });
});
