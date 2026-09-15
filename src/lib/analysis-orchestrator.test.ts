import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./groq", () => ({ generateMatchAnalysis: vi.fn(), GROQ_MODEL: "openai/gpt-oss-20b" }));
vi.mock("./gemini-analysis", () => ({
  generateBettingAndSurpriseAnalysis: vi.fn(),
  GEMINI_ANALYSIS_MODEL: "gemini-3.5-flash-lite",
}));

import { generateFullAnalysis } from "./analysis-orchestrator";
import { generateMatchAnalysis } from "./groq";
import { generateBettingAndSurpriseAnalysis } from "./gemini-analysis";

const minimalInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  researchContext: null,
  odds: [{ market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
};

beforeEach(() => {
  vi.mocked(generateMatchAnalysis).mockReset();
  vi.mocked(generateBettingAndSurpriseAnalysis).mockReset();
});

describe("generateFullAnalysis", () => {
  it("calls Groq and Gemini in parallel and merges both results", async () => {
    vi.mocked(generateMatchAnalysis).mockResolvedValue({
      teamAnalystText: "takim",
      commentatorText: "yorum",
      summaryText: "ozet",
      teamAnalystPick: null,
      commentatorPick: null,
    });
    vi.mocked(generateBettingAndSurpriseAnalysis).mockResolvedValue({
      bettingAnalystText: "bahis",
      surprisePickText: "surpriz",
      bettingAnalystPick: null,
      surpriseComboPick: null,
    });

    const result = await generateFullAnalysis(minimalInput);

    expect(result).toEqual({
      team_analyst_text: "takim",
      commentator_text: "yorum",
      summary_text: "ozet",
      betting_analyst_text: "bahis",
      surprise_pick_text: "surpriz",
      model_used: "openai/gpt-oss-20b+gemini-3.5-flash-lite",
      team_analyst_pick: null,
      commentator_pick: null,
      betting_analyst_pick: null,
      surprise_combo_pick: null,
    });
  });

  it("resolves each persona's pick to a real price from the odds it was given, by exact market+outcome match", async () => {
    vi.mocked(generateMatchAnalysis).mockResolvedValue({
      teamAnalystText: "takim",
      commentatorText: "yorum",
      summaryText: "ozet",
      teamAnalystPick: { market: "h2h", outcome: "Arsenal" },
      commentatorPick: { market: "h2h", outcome: "Chelsea" }, // odds'ta yok
    });
    vi.mocked(generateBettingAndSurpriseAnalysis).mockResolvedValue({
      bettingAnalystText: "bahis",
      surprisePickText: "surpriz",
      bettingAnalystPick: { market: "h2h", outcome: "Arsenal" },
      surpriseComboPick: null,
    });

    const result = await generateFullAnalysis(minimalInput);

    expect(result!.team_analyst_pick).toEqual({ market: "h2h", outcome: "Arsenal", price: 1.8 });
    expect(result!.commentator_pick).toBeNull();
    expect(result!.betting_analyst_pick).toEqual({ market: "h2h", outcome: "Arsenal", price: 1.8 });
    expect(result!.surprise_combo_pick).toBeNull();
  });

  it("returns null when the core (Groq) call fails, regardless of the extra (Gemini) call", async () => {
    vi.mocked(generateMatchAnalysis).mockResolvedValue(null);
    vi.mocked(generateBettingAndSurpriseAnalysis).mockResolvedValue({
      bettingAnalystText: "bahis",
      surprisePickText: "surpriz",
      bettingAnalystPick: null,
      surpriseComboPick: null,
    });

    const result = await generateFullAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("still returns an analysis with fallback text when only the extra (Gemini) call fails", async () => {
    vi.mocked(generateMatchAnalysis).mockResolvedValue({
      teamAnalystText: "takim",
      commentatorText: "yorum",
      summaryText: "ozet",
      teamAnalystPick: null,
      commentatorPick: null,
    });
    vi.mocked(generateBettingAndSurpriseAnalysis).mockResolvedValue(null);

    const result = await generateFullAnalysis(minimalInput);

    expect(result).not.toBeNull();
    expect(result!.team_analyst_text).toBe("takim");
    expect(result!.betting_analyst_text).toBeTruthy();
    expect(result!.surprise_pick_text).toBe("");
    expect(result!.model_used).toBe("openai/gpt-oss-20b");
    expect(result!.betting_analyst_pick).toBeNull();
  });

  it("runs both providers concurrently, not sequentially", async () => {
    const order: string[] = [];
    vi.mocked(generateMatchAnalysis).mockImplementation(async () => {
      order.push("groq-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("groq-end");
      return { teamAnalystText: "t", commentatorText: "c", summaryText: "s", teamAnalystPick: null, commentatorPick: null };
    });
    vi.mocked(generateBettingAndSurpriseAnalysis).mockImplementation(async () => {
      order.push("gemini-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("gemini-end");
      return { bettingAnalystText: "b", surprisePickText: "sp", bettingAnalystPick: null, surpriseComboPick: null };
    });

    await generateFullAnalysis(minimalInput);

    // Ikisi de baslamis olmali, birbirini bloklamadan (sirali olsaydi
    // groq-end, gemini-start'tan once gelirdi).
    expect(order[0]).toBe("groq-start");
    expect(order[1]).toBe("gemini-start");
  });
});
