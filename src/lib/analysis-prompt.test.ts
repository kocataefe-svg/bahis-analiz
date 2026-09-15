import { describe, it, expect } from "vitest";
import { buildTeamAndCommentaryPrompt, buildBettingAndSurprisePrompt } from "./analysis-prompt";

const baseInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  researchContext: null,
  odds: [],
};

describe("buildTeamAndCommentaryPrompt (Groq: Takim Analizcisi + Yorumcu)", () => {
  it("includes both team names and kickoff time", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("Arsenal");
    expect(prompt).toContain("Chelsea");
    expect(prompt).toContain("2026-09-20T15:00:00Z");
  });

  it("asks for the two core personas and the JSON fields it needs", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("Takim Analizcisi");
    expect(prompt).toContain("Yorumcu");
    expect(prompt).toContain("team_analyst_text");
    expect(prompt).toContain("commentator_text");
    expect(prompt).toContain("summary_text");
    expect(prompt).not.toContain("Bahis Analizcisi");
    expect(prompt).not.toContain("Surpriz Yorumcu");
  });

  it("marks missing research context explicitly instead of omitting it", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("Sakatlik/form/H2H arastirmasi mevcut degil");
  });

  it("includes the cached research content when present", () => {
    const prompt = buildTeamAndCommentaryPrompt({
      ...baseInput,
      researchContext: "Arsenal'de Saka sakat, Chelsea son 5 mactir yenilmiyor.",
    });
    expect(prompt).toContain("Arsenal'de Saka sakat, Chelsea son 5 mactir yenilmiyor.");
  });

  it("marks missing odds explicitly and warns against value-bet commentary", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("Oran verisi mevcut degil");
  });

  it("groups odds by market with Turkish labels and tells the model to comment on every mandatory market present", () => {
    const prompt = buildTeamAndCommentaryPrompt({
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

  it("ignores odds from unknown market keys (e.g. Betfair exchange h2h_lay)", () => {
    const prompt = buildTeamAndCommentaryPrompt({
      ...baseInput,
      odds: [{ market: "h2h_lay", bookmaker: "betfair_ex_eu", outcome: "Arsenal", price: 4.5 }],
    });
    expect(prompt).not.toContain("h2h_lay");
    expect(prompt).not.toContain("betfair_ex_eu");
    expect(prompt).toContain("Oran verisi mevcut degil");
  });

  it("tells the model not to comment on mandatory markets that have no odds data", () => {
    const prompt = buildTeamAndCommentaryPrompt({
      ...baseInput,
      odds: [{ market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
    });
    expect(prompt).toContain("2.5 Alt/Ust");
    expect(prompt).toContain("Karsilikli Gol (KG Var/Yok)");
    expect(prompt).toContain("bunlar hakkinda yorum/tahmin yapma");
  });

  it("includes optional markets (e.g. first-half totals) without demanding a mandatory pick for them", () => {
    const prompt = buildTeamAndCommentaryPrompt({
      ...baseInput,
      odds: [
        { market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 },
        { market: "totals_h1", bookmaker: "pinnacle", outcome: "Over 1.5", price: 2.0 },
      ],
    });
    expect(prompt).toContain("Ilk Yari 1.5 Alt/Ust");
    expect(prompt).toContain("opsiyoneldir");
  });

  it("tells Yorumcu to actually reference optional markets instead of naming only the other prompt's personas", () => {
    const prompt = buildTeamAndCommentaryPrompt({
      ...baseInput,
      odds: [
        { market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 },
        { market: "totals_h1", bookmaker: "pinnacle", outcome: "Over 1.5", price: 2.0 },
      ],
    });
    expect(prompt).not.toContain("Bahis Analizcisi");
    expect(prompt).not.toContain("Surpriz Yorumcu");
    expect(prompt).toContain("bu verileri tamamen yok saymak da YASAK");
  });

  it("demands a decisive 'Tahminim: ...' pick per market and forbids hedging language", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("Tahminim:");
    expect(prompt).toContain("YASAK");
    expect(prompt).toContain("net bir tahmin");
  });

  it("forbids dumping raw odds numbers back to back and forbids the garbled 'team name + digit' pick format", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("RAKAM RAKAM SIRALAMA KESINLIKLE YASAK");
    expect(prompt).toContain("Tahminim: Ajax 1");
    expect(prompt).toContain("Tahminim: MS [takim adi]");
  });

  it("tells the team analyst persona to actually use the research content, not just acknowledge its absence", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("mutlaka kullan");
  });

  it("forbids inventing numeric stats (goal averages, injury counts) when there is no research context", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("UYDURMA");
    expect(prompt).toContain("gol ortalamasi");
  });

  it("asks for natural, readable prose instead of a number/odds dump", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("OKUNABILIRLIK");
    expect(prompt).toContain("ASLA SAYI UYDURMA");
  });

  it("asks for critical player names to be wrapped in ** for highlighting", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("**isim**");
  });

  it("asks for a structured team_analyst_pick/commentator_pick field matching a real odds outcome", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("team_analyst_pick");
    expect(prompt).toContain("commentator_pick");
    expect(prompt).toContain("AYNEN");
  });

  it("forbids defensive investment-advice hedging and asks for confident tone", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("yatirim tavsiyesi degildir");
    expect(prompt).toContain("KULLANMA");
  });

  it("frames the personas as competing on prediction accuracy and asks for a probability-weighted pick", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("isabet orani");
    expect(prompt).toContain("oranin ima ettigi olasiligi");
  });

  it("allows one optional free prediction on a market with no odds data, kept out of the structured pick field", () => {
    const prompt = buildTeamAndCommentaryPrompt(baseInput);
    expect(prompt).toContain("SERBEST TAHMIN");
    expect(prompt).toContain("hem gol hem asist");
    expect(prompt).toContain("YAPISAL pick alanina KESINLIKLE dahil etme");
  });
});

describe("buildBettingAndSurprisePrompt (Gemini: Bahis Analizcisi + Surpriz Yorumcu)", () => {
  it("asks for the two numeric-heavy personas and the JSON fields it needs, not the core two", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("Bahis Analizcisi");
    expect(prompt).toContain("Surpriz Yorumcu");
    expect(prompt).toContain("betting_analyst_text");
    expect(prompt).toContain("surprise_pick_text");
    expect(prompt).not.toContain("Takim Analizcisi");
  });

  it("allows a combined two-item surprise suggestion and forbids inventing Turkish-site-specific odds", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("sürpriz kombinasyon");
    expect(prompt).toContain("UYDURMA");
    expect(prompt).toContain("Bilyoner");
  });

  it("includes odds and research context like the other prompt", () => {
    const prompt = buildBettingAndSurprisePrompt({
      ...baseInput,
      odds: [{ market: "h2h", bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
      researchContext: "Arsenal formda.",
    });
    expect(prompt).toContain("pinnacle");
    expect(prompt).toContain("Arsenal formda.");
  });

  it("forbids fabricated numeric stats here too", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("ASLA SAYI UYDURMA");
  });

  it("forbids inventing an exact scoreline and requires labeling first-half vs full-time legs in a combo", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("KESIN SKOR");
    expect(prompt).toContain("Ilk yari: ...");
  });

  it("asks for a structured betting_analyst_pick/surprise_combo_pick field, single-leg only for the combo", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("betting_analyst_pick");
    expect(prompt).toContain("surprise_combo_pick");
    expect(prompt).toContain("EN ONE CIKAN");
  });

  it("forbids defensive investment-advice hedging and frames the personas as competing on accuracy, without naming the other prompt's personas", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("yatirim tavsiyesi degildir");
    expect(prompt).toContain("isabet orani");
    expect(prompt).not.toContain("Takim Analizcisi");
  });

  it("allows one optional free prediction on a market with no odds data", () => {
    const prompt = buildBettingAndSurprisePrompt(baseInput);
    expect(prompt).toContain("SERBEST TAHMIN");
  });
});
