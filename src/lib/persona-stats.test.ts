import { describe, it, expect } from "vitest";
import { computePersonaStats, type ResolvedMatchForStats } from "./persona-stats";

function match(overrides: Partial<ResolvedMatchForStats> = {}): ResolvedMatchForStats {
  return {
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeScore: 2,
    awayScore: 1,
    teamAnalystPick: null,
    commentatorPick: null,
    bettingAnalystPick: null,
    surpriseComboPick: null,
    ...overrides,
  };
}

describe("computePersonaStats", () => {
  it("returns zeroed stats for every persona when there are no matches", () => {
    const stats = computePersonaStats([]);
    expect(stats.teamAnalyst).toEqual({ won: 0, lost: 0, total: 0 });
    expect(stats.commentator).toEqual({ won: 0, lost: 0, total: 0 });
    expect(stats.bettingAnalyst).toEqual({ won: 0, lost: 0, total: 0 });
    expect(stats.surpriseCombo).toEqual({ won: 0, lost: 0, total: 0 });
  });

  it("counts a winning h2h pick for the team analyst", () => {
    const stats = computePersonaStats([
      match({ teamAnalystPick: { market: "h2h", outcome: "Arsenal", price: 1.8 } }),
    ]);
    expect(stats.teamAnalyst).toEqual({ won: 1, lost: 0, total: 1 });
  });

  it("counts a losing pick separately per persona", () => {
    const stats = computePersonaStats([
      match({ commentatorPick: { market: "h2h", outcome: "Chelsea", price: 4.2 } }),
    ]);
    expect(stats.commentator).toEqual({ won: 0, lost: 1, total: 1 });
  });

  it("does not count a pick with no resolvable result (e.g. half-time market)", () => {
    const stats = computePersonaStats([
      match({ bettingAnalystPick: { market: "h2h_h1", outcome: "Arsenal", price: 2.1 } }),
    ]);
    expect(stats.bettingAnalyst).toEqual({ won: 0, lost: 0, total: 0 });
  });

  it("does not count a null pick", () => {
    const stats = computePersonaStats([match({ surpriseComboPick: null })]);
    expect(stats.surpriseCombo).toEqual({ won: 0, lost: 0, total: 0 });
  });

  it("aggregates across multiple matches", () => {
    const stats = computePersonaStats([
      match({ teamAnalystPick: { market: "h2h", outcome: "Arsenal", price: 1.8 } }),
      match({
        homeTeam: "Liverpool",
        awayTeam: "Everton",
        homeScore: 0,
        awayScore: 1,
        teamAnalystPick: { market: "h2h", outcome: "Liverpool", price: 1.5 },
      }),
    ]);
    expect(stats.teamAnalyst).toEqual({ won: 1, lost: 1, total: 2 });
  });
});
