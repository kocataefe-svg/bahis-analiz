const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

export interface LeagueSearchResult {
  apiFootballId: number;
  currentSeason: number;
}

export interface ApiFootballFixture {
  apiFixtureId: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamApiId: number;
  awayTeamApiId: number;
}

export interface RecentFixtureResult {
  apiFixtureId: number;
  date: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
}

function getApiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("API_FOOTBALL_KEY env degiskeni tanimli degil");
  }
  return key;
}

async function apiFootballFetch(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${API_FOOTBALL_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": getApiKey() },
  });
  if (!res.ok) {
    console.warn(`API-Football istegi basarisiz: ${path} -> ${res.status}`);
    return null;
  }
  return res.json();
}

export async function searchLeague(name: string, country: string): Promise<LeagueSearchResult | null> {
  const data = await apiFootballFetch("/leagues", { name, country });
  const first = data?.response?.[0];
  if (!first) return null;
  const currentSeason = first.seasons?.find((s: any) => s.current)?.year;
  if (!first.league?.id || !currentSeason) return null;
  return { apiFootballId: first.league.id, currentSeason };
}

export async function getUpcomingFixtures(
  leagueId: number,
  season: number,
  fromDate: string,
  toDate: string,
): Promise<ApiFootballFixture[]> {
  const data = await apiFootballFetch("/fixtures", {
    league: String(leagueId),
    season: String(season),
    from: fromDate,
    to: toDate,
  });
  const list = data?.response ?? [];
  return list
    .filter((item: any) => item?.fixture?.id && item?.teams?.home?.name && item?.teams?.away?.name)
    .map((item: any) => ({
      apiFixtureId: item.fixture.id,
      kickoffAt: item.fixture.date,
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
      homeTeamApiId: item.teams.home.id,
      awayTeamApiId: item.teams.away.id,
    }));
}

export async function getRecentFixtures(teamId: number, count: number): Promise<RecentFixtureResult[]> {
  const data = await apiFootballFetch("/fixtures", {
    team: String(teamId),
    last: String(count),
  });
  const list = data?.response ?? [];
  return list
    .filter((item: any) => item?.fixture?.id && item?.goals?.home != null && item?.goals?.away != null)
    .map((item: any) => {
      const isHome = item.teams.home.id === teamId;
      const goalsFor = isHome ? item.goals.home : item.goals.away;
      const goalsAgainst = isHome ? item.goals.away : item.goals.home;
      const opponent = isHome ? item.teams.away.name : item.teams.home.name;
      let result: "W" | "D" | "L" = "D";
      if (goalsFor > goalsAgainst) result = "W";
      else if (goalsFor < goalsAgainst) result = "L";
      return {
        apiFixtureId: item.fixture.id,
        date: item.fixture.date,
        opponent,
        goalsFor,
        goalsAgainst,
        result,
      };
    });
}

export async function getInjuriesForFixture(fixtureId: number): Promise<unknown[]> {
  const data = await apiFootballFetch("/injuries", { fixture: String(fixtureId) });
  return data?.response ?? [];
}
