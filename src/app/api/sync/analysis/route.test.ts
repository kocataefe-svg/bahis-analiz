import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ getLatestOdds: vi.fn() }));
vi.mock("@/lib/db/match-research", () => ({ getMatchResearch: vi.fn() }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/ai-analyses", () => ({
  getLatestAnalysisGeneratedAt: vi.fn(),
  needsFreshAnalysis: vi.fn(),
  insertAiAnalysis: vi.fn(),
}));
vi.mock("@/lib/groq", () => ({ generateMatchAnalysis: vi.fn(), GROQ_MODEL: "openai/gpt-oss-20b" }));
vi.mock("@/lib/odds-enrichment", () => ({ ensureExtraMarketsOdds: vi.fn() }));

import { POST } from "./route";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestOdds } from "@/lib/db/odds";
import { getMatchResearch } from "@/lib/db/match-research";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateMatchAnalysis } from "@/lib/groq";
import { ensureExtraMarketsOdds } from "@/lib/odds-enrichment";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/analysis", { method: "POST", headers });
}

const match = {
  id: "m1",
  leagueId: "l1",
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  oddsApiEventId: "evt1",
};

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(getLatestOdds).mockReset().mockResolvedValue([]);
  vi.mocked(getMatchResearch).mockReset().mockResolvedValue(null);
  vi.mocked(getActiveLeagues).mockReset().mockResolvedValue([{ id: "l1", oddsApiSportKey: "soccer_epl" }]);
  vi.mocked(ensureExtraMarketsOdds).mockReset().mockResolvedValue(false);
  vi.mocked(getLatestAnalysisGeneratedAt).mockReset().mockResolvedValue(null);
  vi.mocked(needsFreshAnalysis).mockReset().mockReturnValue(true);
  vi.mocked(insertAiAnalysis).mockReset().mockResolvedValue(undefined);
  vi.mocked(generateMatchAnalysis).mockReset().mockResolvedValue({
    teamAnalystText: "a",
    bettingAnalystText: "b",
    commentatorText: "c",
    surprisePickText: "e",
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
      expect.objectContaining({ homeTeam: "Arsenal", awayTeam: "Chelsea", researchContext: null }),
    );
    expect(insertAiAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        match_id: "m1",
        team_analyst_text: "a",
        betting_analyst_text: "b",
        commentator_text: "c",
        surprise_pick_text: "e",
        summary_text: "d",
        model_used: "openai/gpt-oss-20b",
      }),
    );
    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 0 });
  });

  it("ensures missing extra markets are fetched for the match's league before generating analysis", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(ensureExtraMarketsOdds).toHaveBeenCalledWith(expect.anything(), "m1", "evt1", "soccer_epl", new Set());
  });

  it("re-reads odds when ensureExtraMarketsOdds inserted new rows, so the fresh markets reach the prompt", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getLatestOdds)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { market: "totals", outcome: "Over 2.5", bookmaker: "pinnacle", price: 1.9, fetchedAt: "2026-09-14T10:00:00Z" },
      ]);
    vi.mocked(ensureExtraMarketsOdds).mockResolvedValue(true);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(getLatestOdds).toHaveBeenCalledTimes(2);
    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ odds: [{ market: "totals", bookmaker: "pinnacle", outcome: "Over 2.5", price: 1.9 }] }),
    );
  });

  it("skips ensureExtraMarketsOdds when the match's league has no odds api sport key", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getActiveLeagues).mockResolvedValue([{ id: "l1", oddsApiSportKey: null }]);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(ensureExtraMarketsOdds).not.toHaveBeenCalled();
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
      surprisePickText: "e",
      summaryText: "d",
    });

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(insertAiAnalysis).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("continues to the next match and counts a failure when a DB call throws", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match, { ...match, id: "m2" }]);
    vi.mocked(getLatestOdds).mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("passes missing odds through as empty so the prompt marks them as unavailable", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getLatestOdds).mockResolvedValue([]);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ researchContext: null, odds: [] }),
    );
  });

  it("passes cached research content into the prompt when it exists", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getMatchResearch).mockResolvedValue({
      content: "Arsenal'de Saka sakat.",
      sources: [],
      modelUsed: "gemini-3.5-flash-lite",
      generatedAt: "2026-09-14T10:00:00Z",
    });

    await POST(makeRequest("Bearer test-secret") as any);

    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ researchContext: "Arsenal'de Saka sakat." }),
    );
  });
});
