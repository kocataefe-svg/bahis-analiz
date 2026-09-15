const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";

export interface OddsQuote {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  market: string;
  outcome: string;
  point?: number;
  /** Oyuncu bazli pazarlarda (orn. golu atacak oyuncu) oyuncu adi burada gelir. */
  description?: string;
  price: number;
}

interface RawOddsOutcome {
  name: string;
  price: number;
  point?: number;
  description?: string;
}

interface RawOddsMarket {
  key: string;
  outcomes?: RawOddsOutcome[];
}

interface RawOddsBookmaker {
  key: string;
  markets?: RawOddsMarket[];
}

interface RawOddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: RawOddsBookmaker[];
}

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error("ODDS_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

function flattenEvent(event: RawOddsEvent): OddsQuote[] {
  const quotes: OddsQuote[] = [];
  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      for (const outcome of market.outcomes ?? []) {
        quotes.push({
          eventId: event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          commenceTime: event.commence_time,
          bookmaker: bookmaker.key,
          market: market.key,
          outcome: outcome.name,
          point: outcome.point,
          description: outcome.description,
          price: outcome.price,
        });
      }
    }
  }
  return quotes;
}

export async function getOddsForSport(sportKey: string): Promise<OddsQuote[]> {
  const url = new URL(`${ODDS_API_BASE_URL}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("regions", "eu");
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "decimal");

  let data: unknown;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`The Odds API istegi basarisiz: ${sportKey} -> ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.warn(`The Odds API istegi basarisiz (ag hatasi): ${sportKey} ->`, err);
    return [];
  }

  const quotes: OddsQuote[] = [];
  for (const event of (data as RawOddsEvent[] | null) ?? []) {
    quotes.push(...flattenEvent(event));
  }
  return quotes;
}

export interface MatchScore {
  eventId: string;
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

interface RawScoreEntry {
  name: string;
  score: string;
}

interface RawScoreEvent {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: RawScoreEntry[] | null;
}

function parseScoreEvent(event: RawScoreEvent): MatchScore {
  const homeEntry = event.scores?.find((s) => s.name === event.home_team);
  const awayEntry = event.scores?.find((s) => s.name === event.away_team);
  const homeScore = homeEntry ? Number(homeEntry.score) : NaN;
  const awayScore = awayEntry ? Number(awayEntry.score) : NaN;

  return {
    eventId: event.id,
    completed: event.completed,
    homeScore: Number.isFinite(homeScore) ? homeScore : null,
    awayScore: Number.isFinite(awayScore) ? awayScore : null,
  };
}

/**
 * Tamamlanmis maclarin skorunu ceker. daysFrom belirtilmezse sadece
 * canli/gelecek maclar donuyor (1 kredi) - tamamlanmis maclar icin
 * daysFrom sart (2 kredi, lig basina - bkz. The Odds API dokumantasyonu).
 * eventIds ile tek bir lig icindeki belirli maclara daraltilir, boylece
 * o ligdeki tum maclar degil sadece ilgilenilenler islenir (kredi
 * maliyetini degistirmez ama yanit boyutunu kuculttur).
 */
export async function getScoresForSport(sportKey: string, eventIds: string[]): Promise<MatchScore[]> {
  if (eventIds.length === 0) return [];

  const url = new URL(`${ODDS_API_BASE_URL}/sports/${sportKey}/scores`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("daysFrom", "3");
  url.searchParams.set("eventIds", eventIds.join(","));

  let data: unknown;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`The Odds API skor istegi basarisiz: ${sportKey} -> ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.warn(`The Odds API skor istegi basarisiz (ag hatasi): ${sportKey} ->`, err);
    return [];
  }

  return ((data as RawScoreEvent[] | null) ?? []).map(parseScoreEvent);
}

export async function getEventOdds(sportKey: string, eventId: string, markets: string): Promise<OddsQuote[]> {
  const url = new URL(`${ODDS_API_BASE_URL}/sports/${sportKey}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("regions", "eu");
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", "decimal");

  let data: unknown;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`The Odds API event istegi basarisiz: ${eventId} -> ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.warn(`The Odds API event istegi basarisiz (ag hatasi): ${eventId} ->`, err);
    return [];
  }

  const event = data as RawOddsEvent | null;
  if (!event) return [];
  return flattenEvent(event);
}
