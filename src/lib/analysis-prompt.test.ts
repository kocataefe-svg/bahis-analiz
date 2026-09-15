import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt } from "./analysis-prompt";

const baseInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  researchContext: null,
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

  it("marks missing research context explicitly instead of omitting it", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Sakatlik/form/H2H arastirmasi mevcut degil");
  });

  it("includes the cached research content when present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      researchContext: "Arsenal'de Saka sakat, Chelsea son 5 mactir yenilmiyor.",
    });
    expect(prompt).toContain("Arsenal'de Saka sakat, Chelsea son 5 mactir yenilmiyor.");
  });

  it("marks missing odds explicitly and warns against value-bet commentary", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Oran verisi mevcut degil");
  });

  it("includes bookmaker/outcome/price when odds are present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      odds: [{ market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
    });
    expect(prompt).toContain("pinnacle");
    expect(prompt).toContain("Arsenal");
    expect(prompt).toContain("1.8");
  });

  it("groups odds by market with Turkish labels and tells the model to comment on every market present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      odds: [
        { market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 },
        { market: "totals", bookmaker: "pinnacle", outcome: "Over 2.5", price: 1.9 },
        { market: "btts", bookmaker: "pinnacle", outcome: "Yes", price: 1.7 },
      ],
    });
    expect(prompt).toContain("Taraf Bahsi (1X2)");
    expect(prompt).toContain("2.5 Alt/Ust");
    expect(prompt).toContain("Karsilikli Gol (KG Var/Yok)");
    expect(prompt).toContain("HER UCU icin de ayri ayri yorum");
  });

  it("tells the model not to comment on markets that have no odds data", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      odds: [{ market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
    });
    expect(prompt).toContain("2.5 Alt/Ust");
    expect(prompt).toContain("Karsilikli Gol (KG Var/Yok)");
    expect(prompt).toContain("bunlar hakkinda yorum/tahmin yapma");
  });
});
