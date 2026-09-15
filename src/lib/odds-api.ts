const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";

export interface OddsQuote {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  market: string;
  outcome: string;
  price: number;
}

interface RawOddsOutcome {
  name: string;
  price: number;
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
            price: outcome.price,
          });
        }
      }
    }
  }
  return quotes;
}
