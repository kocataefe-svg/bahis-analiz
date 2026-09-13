export interface TeamStatsForPrompt {
  form: string | null;
  injuries: unknown[];
  cards: unknown[];
  lastMatches: unknown[];
}

export interface OddsForPrompt {
  bookmaker: string;
  outcome: string;
  price: number;
}

export interface AnalysisPromptInput {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeStats: TeamStatsForPrompt | null;
  awayStats: TeamStatsForPrompt | null;
  odds: OddsForPrompt[];
}

function formatTeamStats(label: string, stats: TeamStatsForPrompt | null): string {
  if (!stats) {
    return `${label}: Bu takim icin istatistik verisi mevcut degil. Bu durumu belirt ve temkinli yorum yap.`;
  }
  return [
    `${label}:`,
    `- Son form: ${stats.form || "bilinmiyor"}`,
    `- Sakatlik/cezali sayisi: ${stats.injuries.length}`,
    `- Kart cezasi sayisi: ${stats.cards.length}`,
    `- Son maclar: ${JSON.stringify(stats.lastMatches)}`,
  ].join("\n");
}

function formatOdds(odds: OddsForPrompt[]): string {
  if (odds.length === 0) {
    return "Oran verisi mevcut degil. Oran bazli yorum (value bet vs.) yapma, sadece takim/istatistik yorumuna odaklan.";
  }
  return [
    "Guncel referans oranlar (uluslararasi bookmaker, Iddaa/Nesine ile birebir ayni degil):",
    ...odds.map((o) => `- ${o.bookmaker}: ${o.outcome} @ ${o.price}`),
  ].join("\n");
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  return [
    "Sen bir futbol bahis analiz ekibisin. Asagidaki mac icin uc ayri persona olarak Turkce yorum uret:",
    "1. Takim Analizcisi: form, sakatlik, kart cezasi, onemli anlar (orn. play-off/sampiyonluk icin 3 puan gerekliligi) uzerinden yorum.",
    "2. Bahis Analizcisi: istatistik + oran okumasi, value degerlendirmesi (oran varsa).",
    "3. Yorumcu: genel mac yorumu ve tahmini.",
    "Ayrica kisa bir summary_text ozet alani uret.",
    "",
    `Mac: ${input.homeTeam} - ${input.awayTeam}, ${input.kickoffAt}`,
    "",
    formatTeamStats(`Ev sahibi (${input.homeTeam})`, input.homeStats),
    "",
    formatTeamStats(`Deplasman (${input.awayTeam})`, input.awayStats),
    "",
    formatOdds(input.odds),
    "",
    "Eksik veri varsa bunu acikca belirt, veri yokmus gibi davranma veya uydurma.",
  ].join("\n");
}
