import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt } from "./analysis-prompt";

const baseInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  homeStats: null,
  awayStats: null,
  odds: [],
};

describe("buildAnalysisPrompt", () => {
  it("includes both team names and kickoff time", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Arsenal");
    expect(prompt).toContain("Chelsea");
    expect(prompt).toContain("2026-09-20T15:00:00Z");
  });

  it("asks for all three personas and a summary field", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Takim Analizcisi");
    expect(prompt).toContain("Bahis Analizcisi");
    expect(prompt).toContain("Yorumcu");
    expect(prompt).toContain("summary_text");
  });

  it("marks missing home/away stats explicitly instead of omitting them", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("istatistik verisi mevcut degil");
  });

  it("includes form/injury/card counts when stats are present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      homeStats: {
        form: "WWDLW",
        injuries: [{ player: "X" }],
        cards: [{ player: "Y" }],
        lastMatches: [{ opponent: "Everton", goalsFor: 2, goalsAgainst: 1, result: "W" }],
      },
    });
    expect(prompt).toContain("WWDLW");
    expect(prompt).toContain("Sakatlik/cezali sayisi: 1");
    expect(prompt).toContain("1 oyuncu cezali");
    expect(prompt).toContain("Everton");
  });

  it("never claims a verified zero card suspension count when cards data was simply never collected", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      homeStats: {
        form: "WWDLW",
        injuries: [],
        cards: [],
        lastMatches: [],
      },
    });
    expect(prompt).toContain("veri toplanmiyor");
    expect(prompt).not.toContain("Kart cezasi sayisi");
  });

  it("marks missing odds explicitly and warns against value-bet commentary", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Oran verisi mevcut degil");
  });

  it("includes bookmaker/outcome/price when odds are present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      odds: [{ bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
    });
    expect(prompt).toContain("pinnacle");
    expect(prompt).toContain("Arsenal");
    expect(prompt).toContain("1.8");
  });
});
