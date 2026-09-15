export type PickResultStatus = "won" | "lost" | "unknown";

export interface FinalScore {
  homeScore: number;
  awayScore: number;
}

/**
 * Bir pick'in (market/outcome) mac sonucuna gore tutup tutmadigini belirler.
 * Sadece tam mac sonucundan (skor) hesaplanabilen pazarlar cozulur: h2h
 * (MS 1X2), totals (2.5 alt/ust - tek desteklenen cizgi), btts (KG var/yok).
 * Ilk yari, handikap ve gol atacak oyuncu pazarlari icin skor tek basina
 * yeterli veri degil - bunlar her zaman "unknown" doner.
 */
export function resolvePickResult(
  pick: { market: string; outcome: string },
  result: FinalScore,
  homeTeam: string,
  awayTeam: string,
): PickResultStatus {
  const { homeScore, awayScore } = result;

  if (pick.market === "h2h") {
    if (pick.outcome === homeTeam) return homeScore > awayScore ? "won" : "lost";
    if (pick.outcome === awayTeam) return awayScore > homeScore ? "won" : "lost";
    if (pick.outcome === "Draw") return homeScore === awayScore ? "won" : "lost";
    return "unknown";
  }

  if (pick.market === "totals") {
    const total = homeScore + awayScore;
    if (pick.outcome === "Over 2.5") return total > 2.5 ? "won" : "lost";
    if (pick.outcome === "Under 2.5") return total < 2.5 ? "won" : "lost";
    return "unknown";
  }

  if (pick.market === "btts") {
    const bothScored = homeScore > 0 && awayScore > 0;
    if (pick.outcome === "Yes") return bothScored ? "won" : "lost";
    if (pick.outcome === "No") return bothScored ? "lost" : "won";
    return "unknown";
  }

  return "unknown";
}
