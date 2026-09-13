import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/team-stats", () => ({ getLatestTeamStats: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ getLatestOdds: vi.fn() }));
vi.mock("@/lib/db/ai-analyses", () => ({
  getLatestAnalysisGeneratedAt: vi.fn(),
  needsFreshAnalysis: vi.fn(),
  insertAiAnalysis: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({ generateMatchAnalysis: vi.fn(), GEMINI_MODEL: "gemini-3.5-flash-lite" }));

import { POST } from "./route";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestTeamStats } from "@/lib/db/team-stats";
import { getLatestOdds } from "@/lib/db/odds";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateMatchAnalysis } from "@/lib/gemini";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/analysis", { method: "POST", headers });
}

const match = {
  id: "m1",
  apiFixtureId: 1001,
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  homeTeamApiId: 1,
  awayTeamApiId: 2,
  kickoffAt: "2026-09-20T15:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(getLatestTeamStats).mockReset().mockResolvedValue([]);
  vi.mocked(getLatestOdds).mockReset().mockResolvedValue([]);
  vi.mocked(getLatestAnalysisGeneratedAt).mockReset().mockResolvedValue(null);
  vi.mocked(needsFreshAnalysis).mockReset().mockReturnValue(true);
  vi.mocked(insertAiAnalysis).mockReset().mockResolvedValue(undefined);
  vi.mocked(generateMatchAnalysis).mockReset().mockResolvedValue({
    teamAnalystText: "a",
    bettingAnalystText: "b",
    commentatorText: "c",
    summaryText: "d",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/analysis", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("generates and stores an analysis for a match that needs one", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getUpcomingMatches).toHaveBeenCalledWith(expect.anything(), 3, 15);
    expect(needsFreshAnalysis).toHaveBeenCalledWith(null, null);
    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ homeTeam: "Arsenal", awayTeam: "Chelsea" }),
    );
    expect(insertAiAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        match_id: "m1",
        team_analyst_text: "a",
        betting_analyst_text: "b",
        commentator_text: "c",
        summary_text: "d",
        model_used: "gemini-3.5-flash-lite",
      }),
    );
    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 0 });
  });

  it("skips a match when needsFreshAnalysis returns false", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(needsFreshAnalysis).mockReturnValue(false);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(generateMatchAnalysis).not.toHaveBeenCalled();
    expect(insertAiAnalysis).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, generated: 0, skipped: 1, failed: 0 });
  });

  it("counts a failure and continues when generateMatchAnalysis returns null", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match, { ...match, id: "m2" }]);
    vi.mocked(generateMatchAnalysis).mockResolvedValueOnce(null).mockResolvedValueOnce({
      teamAnalystText: "a",
      bettingAnalystText: "b",
      commentatorText: "c",
      summaryText: "d",
    });

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(insertAiAnalysis).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("continues to the next match and counts a failure when a DB call throws", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match, { ...match, id: "m2" }]);
    vi.mocked(getLatestTeamStats).mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("passes missing stats/odds through as null/empty so the prompt marks them as unavailable", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getLatestTeamStats).mockResolvedValue([]);
    vi.mocked(getLatestOdds).mockResolvedValue([]);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ homeStats: null, awayStats: null, odds: [] }),
    );
  });
});
