export const MARKET_LABELS: Record<string, string> = {
  h2h: "Taraf Bahsi (1X2)",
  totals: "2.5 Alt/Ust",
  btts: "Karsilikli Gol (KG Var/Yok)",
  h2h_h1: "Ilk Yari Taraf Bahsi",
  totals_h1: "Ilk Yari 1.5 Alt/Ust",
  btts_h1: "Ilk Yari KG Var/Yok",
  spreads: "Handikap (+1/+2)",
  player_goal_scorer_anytime: "Gol Atacak Oyuncu",
};

// totals/totals_h1 icin bos birakildi - outcome zaten "2.5 Ust" gibi
// noktayi kendi icinde tasiyor, market onekiyle tekrar etmemesi icin.
const MARKET_SHORT_LABELS: Record<string, string> = {
  h2h: "MS",
  totals: "",
  btts: "KG",
  h2h_h1: "IY MS",
  totals_h1: "IY",
  btts_h1: "IY KG",
  spreads: "Handikap",
  player_goal_scorer_anytime: "Gol",
};

const OUTCOME_SHORT_LABELS: Record<string, string> = {
  Yes: "Var",
  No: "Yok",
  Draw: "Beraberlik",
};

function shortenOutcome(outcome: string): string {
  if (outcome in OUTCOME_SHORT_LABELS) return OUTCOME_SHORT_LABELS[outcome];
  const overMatch = outcome.match(/^Over\s+(\S+)/);
  if (overMatch) return `${overMatch[1]} Ust`;
  const underMatch = outcome.match(/^Under\s+(\S+)/);
  if (underMatch) return `${underMatch[1]} Alt`;
  return outcome;
}

/** Bir persona'nin yapisal pick'ini rozet icin kisa Turkce etikete cevirir (orn. "IY KG Var"). */
export function formatPickLabel(market: string, outcome: string): string {
  const marketLabel = market in MARKET_SHORT_LABELS ? MARKET_SHORT_LABELS[market] : (MARKET_LABELS[market] ?? market);
  const outcomeLabel = shortenOutcome(outcome);
  return marketLabel ? `${marketLabel} ${outcomeLabel}` : outcomeLabel;
}
