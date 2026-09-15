import { MARKET_LABELS } from "./market-labels";

export interface OddsForPrompt {
  market: string;
  bookmaker: string;
  outcome: string;
  price: number;
}

export interface AnalysisPromptInput {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  researchContext: string | null;
  odds: OddsForPrompt[];
}

function formatResearchContext(researchContext: string | null): string {
  if (!researchContext) {
    return "Sakatlik/form/H2H arastirmasi mevcut degil (henuz 'Arastir' butonuyla tetiklenmemis). Bu durumu belirt ve temkinli yorum yap.";
  }
  return ["Sakatlik/form/H2H arastirmasi (web arama ile toplanmis):", researchContext].join("\n");
}

function formatOdds(odds: OddsForPrompt[]): string {
  // Odds API bazi bookmaker'lar (orn. Betfair borsasi) icin h2h_lay gibi
  // bilmedigimiz ek market anahtarlari dondurebiliyor - sadece bildigimiz
  // (yorum yapmasi istenen) pazarlar prompt'a girsin.
  const knownOdds = odds.filter((o) => o.market in MARKET_LABELS);
  if (knownOdds.length === 0) {
    return "Oran verisi mevcut degil. Oran bazli yorum (value bet vs.) yapma, sadece takim/istatistik yorumuna odaklan.";
  }

  const byMarket = new Map<string, OddsForPrompt[]>();
  for (const o of knownOdds) {
    if (!byMarket.has(o.market)) byMarket.set(o.market, []);
    byMarket.get(o.market)!.push(o);
  }

  const lines = ["Guncel referans oranlar (uluslararasi bookmaker, Iddaa/Nesine ile birebir ayni degil), pazar bazinda:"];
  for (const [market, quotes] of byMarket) {
    lines.push(`${MARKET_LABELS[market] ?? market}:`);
    lines.push(...quotes.map((o) => `- ${o.bookmaker}: ${o.outcome} @ ${o.price}`));
  }
  const missingMarkets = Object.keys(MARKET_LABELS).filter((m) => !byMarket.has(m));
  if (missingMarkets.length > 0) {
    lines.push(`Su pazarlar icin oran verisi yok, bunlar hakkinda yorum/tahmin yapma: ${missingMarkets.map((m) => MARKET_LABELS[m]).join(", ")}.`);
  }
  return lines.join("\n");
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  return [
    "Sen bir futbol bahis analiz ekibisin. Asagidaki mac icin uc ayri persona olarak Turkce yorum uret:",
    "1. Takim Analizcisi: form, sakatlik, kart cezasi, onemli anlar (orn. play-off/sampiyonluk icin 3 puan gerekliligi) uzerinden yorum.",
    "2. Bahis Analizcisi: istatistik + oran okumasi, value degerlendirmesi (oran varsa).",
    "3. Yorumcu: genel mac yorumu ve tahmini.",
    "Asagida hangi pazarlar icin oran verisi varsa (Taraf Bahsi/1X2, KG Var/Yok, 2.5 Alt/Ust) HER UCU icin de ayri ayri yorum ve tahmin uret - sadece taraf bahsine (1X2) odaklanip digerlerini atlama. Veri olmayan bir pazar hakkinda yorum yapma, bunu acikca belirt.",
    "Ayrica kisa bir summary_text ozet alani uret.",
    "",
    `Mac: ${input.homeTeam} - ${input.awayTeam}, ${input.kickoffAt}`,
    "",
    formatResearchContext(input.researchContext),
    "",
    formatOdds(input.odds),
    "",
    "Eksik veri varsa bunu acikca belirt, veri yokmus gibi davranma veya uydurma.",
  ].join("\n");
}
