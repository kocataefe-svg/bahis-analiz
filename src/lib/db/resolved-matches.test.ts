import { describe, it, expect, vi } from "vitest";

vi.mock("./match-results", () => ({ getAllMatchResults: vi.fn() }));
vi.mock("./matches", () => ({ getMatchTeamsByIds: vi.fn() }));
vi.mock("./ai-analyses", () => ({ getLatestAnalysesByMatchIds: vi.fn() }));

import { getResolvedMatchesForStats } from "./resolved-matches";
import { getAllMatchResults } from "./match-results";
import { getMatchTeamsByIds } from "./matches";
import { getLatestAnalysesByMatchIds } from "./ai-analyses";

describe("getResolvedMatchesForStats", () => {
  it("returns an empty array without further queries when there are no results yet", async () => {
    vi.mocked(getAllMatchResults).mockResolvedValue([]);
    const result = await getResolvedMatchesForStats({} as any);
    expect(result).toEqual([]);
    expect(getMatchTeamsByIds).not.toHaveBeenCalled();
  });

  it("joins match results with team names and the latest analysis picks", async () => {
    vi.mocked(getAllMatchResults).mockResolvedValue([{ matchId: "m1", homeScore: 2, awayScore: 1 }]);
    vi.mocked(getMatchTeamsByIds).mockResolvedValue(
      new Map([["m1", { homeTeam: "Arsenal", awayTeam: "Chelsea" }]]),
    );
    vi.mocked(getLatestAnalysesByMatchIds).mockResolvedValue(
      new Map([
        [
          "m1",
          {
            teamAnalystText: "a",
            bettingAnalystText: "b",
            commentatorText: "c",
            surprisePickText: "e",
            summaryText: "d",
            modelUsed: "openai/gpt-oss-20b",
            generatedAt: "2026-09-14T10:00:00Z",
            teamAnalystPick: { market: "h2h", outcome: "Arsenal", price: 1.8 },
            commentatorPick: null,
            bettingAnalystPick: null,
            surpriseComboPick: null,
          },
        ],
      ]),
    );

    const result = await getResolvedMatchesForStats({} as any);

    expect(result).toEqual([
      {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        homeScore: 2,
        awayScore: 1,
        teamAnalystPick: { market: "h2h", outcome: "Arsenal", price: 1.8 },
        commentatorPick: null,
        bettingAnalystPick: null,
        surpriseComboPick: null,
      },
    ]);
  });

  it("skips a result whose match record is missing (e.g. deleted match)", async () => {
    vi.mocked(getAllMatchResults).mockResolvedValue([{ matchId: "m1", homeScore: 2, awayScore: 1 }]);
    vi.mocked(getMatchTeamsByIds).mockResolvedValue(new Map());
    vi.mocked(getLatestAnalysesByMatchIds).mockResolvedValue(new Map());

    const result = await getResolvedMatchesForStats({} as any);
    expect(result).toEqual([]);
  });

  it("defaults all picks to null when no analysis was ever generated for the match", async () => {
    vi.mocked(getAllMatchResults).mockResolvedValue([{ matchId: "m1", homeScore: 1, awayScore: 1 }]);
    vi.mocked(getMatchTeamsByIds).mockResolvedValue(
      new Map([["m1", { homeTeam: "Arsenal", awayTeam: "Chelsea" }]]),
    );
    vi.mocked(getLatestAnalysesByMatchIds).mockResolvedValue(new Map());

    const result = await getResolvedMatchesForStats({} as any);

    expect(result).toEqual([
      {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        homeScore: 1,
        awayScore: 1,
        teamAnalystPick: null,
        commentatorPick: null,
        bettingAnalystPick: null,
        surpriseComboPick: null,
      },
    ]);
  });
});
