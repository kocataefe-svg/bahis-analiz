const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";

export interface OddsQuote {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  market: string;
  outcome: string;
  price: number;
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
  url.searchParams.set("markets", "h2h,btts");
  url.searchParams.set("oddsFormat", "decimal");

  let res;
  try {
    res = await fetch(url.toString());
  } catch (error) {
    console.warn(`The Odds API istegi basarisiz: ${sportKey} -> network error`);
    return [];
  }

  if (!res.ok) {
    console.warn(`The Odds API istegi basarisiz: ${sportKey} -> ${res.status}`);
    return [];
  }

  const data = await res.json();
  const quotes: OddsQuote[] = [];
  for (const event of data ?? []) {
    for (const bookmaker of event.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        for (const outcome of market.outcomes ?? []) {
          quotes.push({
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
