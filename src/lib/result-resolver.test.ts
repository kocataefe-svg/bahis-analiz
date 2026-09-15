import { describe, it, expect } from "vitest";
import { resolvePickResult } from "./result-resolver";

describe("resolvePickResult", () => {
  describe("h2h", () => {
    it("resolves a home team pick as won when home wins", () => {
      const status = resolvePickResult(
        { market: "h2h", outcome: "Arsenal" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });

    it("resolves a home team pick as lost when home does not win", () => {
      const status = resolvePickResult(
        { market: "h2h", outcome: "Arsenal" },
        { homeScore: 1, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("lost");
    });

    it("resolves an away team pick as won when away wins", () => {
      const status = resolvePickResult(
        { market: "h2h", outcome: "Chelsea" },
        { homeScore: 0, awayScore: 2 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });

    it("resolves a Draw pick as won on a tie", () => {
      const status = resolvePickResult(
        { market: "h2h", outcome: "Draw" },
        { homeScore: 1, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });

    it("resolves a Draw pick as lost when there is a winner", () => {
      const status = resolvePickResult(
        { market: "h2h", outcome: "Draw" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("lost");
    });
  });

  describe("totals", () => {
    it("resolves Over 2.5 as won when total goals exceed 2.5", () => {
      const status = resolvePickResult(
        { market: "totals", outcome: "Over 2.5" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });

    it("resolves Under 2.5 as won when total goals are below 2.5", () => {
      const status = resolvePickResult(
        { market: "totals", outcome: "Under 2.5" },
        { homeScore: 1, awayScore: 0 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });

    it("resolves Under 2.5 as lost when total goals exceed 2.5", () => {
      const status = resolvePickResult(
        { market: "totals", outcome: "Under 2.5" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("lost");
    });
  });

  describe("btts", () => {
    it("resolves Yes as won when both teams score", () => {
      const status = resolvePickResult(
        { market: "btts", outcome: "Yes" },
        { homeScore: 1, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });

    it("resolves No as won when a team is shut out", () => {
      const status = resolvePickResult(
        { market: "btts", outcome: "No" },
        { homeScore: 2, awayScore: 0 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("won");
    });
  });

  describe("unresolvable markets", () => {
    it("returns unknown for half-time markets", () => {
      const status = resolvePickResult(
        { market: "h2h_h1", outcome: "Arsenal" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("unknown");
    });

    it("returns unknown for player goalscorer markets", () => {
      const status = resolvePickResult(
        { market: "player_goal_scorer_anytime", outcome: "Erling Haaland (Favori)" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("unknown");
    });

    it("returns unknown for an outcome that matches neither team name nor Draw", () => {
      const status = resolvePickResult(
        { market: "h2h", outcome: "Some Other Team" },
        { homeScore: 2, awayScore: 1 },
        "Arsenal",
        "Chelsea",
      );
      expect(status).toBe("unknown");
    });
  });
});
