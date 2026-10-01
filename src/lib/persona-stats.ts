import type { ResolvedPersonaPick } from "./persona-pick";
import { resolvePickResult } from "./result-resolver";

export interface ResolvedMatchForStats {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  teamAnalystPick: ResolvedPersonaPick[];
  commentatorPick: ResolvedPersonaPick[];
  bettingAnalystPick: ResolvedPersonaPick[];
  surpriseComboPick: ResolvedPersonaPick[];
}

export interface PersonaStats {
  won: number;
  lost: number;
  total: number;
}

export interface AllPersonaStats {
  teamAnalyst: PersonaStats;
  commentator: PersonaStats;
  bettingAnalyst: PersonaStats;
  surpriseCombo: PersonaStats;
}

function emptyStats(): PersonaStats {
  return { won: 0, lost: 0, total: 0 };
}

/** Bir persona'nin bir mac icin verdigi HER pick'i (0-2) bagimsiz bir tahmin olarak sayar. */
function tally(stats: PersonaStats, picks: ResolvedPersonaPick[], match: ResolvedMatchForStats): void {
  for (const pick of picks) {
    const status = resolvePickResult(pick, match, match.homeTeam, match.awayTeam);
    if (status === "unknown") continue;
    stats.total += 1;
    if (status === "won") stats.won += 1;
    else stats.lost += 1;
  }
}

/** Sonucu belli maclar uzerinden her persona icin isabet/kayip sayisini hesaplar. Sadece h2h/totals/btts gibi tam skordan cozulebilen pickler sayilir. */
export function computePersonaStats(matches: ResolvedMatchForStats[]): AllPersonaStats {
  const result: AllPersonaStats = {
    teamAnalyst: emptyStats(),
    commentator: emptyStats(),
    bettingAnalyst: emptyStats(),
    surpriseCombo: emptyStats(),
  };

  for (const match of matches) {
    tally(result.teamAnalyst, match.teamAnalystPick, match);
    tally(result.commentator, match.commentatorPick, match);
    tally(result.bettingAnalyst, match.bettingAnalystPick, match);
    tally(result.surpriseCombo, match.surpriseComboPick, match);
  }

  return result;
}
