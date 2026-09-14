import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseClient } from "../src/lib/supabase-core";
import { searchLeague } from "../src/lib/api-football";
import { LEAGUE_CATALOG } from "../src/lib/league-catalog";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API-Football'un ucretsiz plani dakikada ~10 istekle sinirli. Aralarina
// bekleme koymadan art arda 14 lig aranirsa 10'dan sonrakiler 429 aliyor.
const REQUEST_DELAY_MS = 7000;

async function main() {
  const supabase = getSupabaseClient();

  for (const [index, entry] of LEAGUE_CATALOG.entries()) {
    if (index > 0) await sleep(REQUEST_DELAY_MS);

    const found = await searchLeague(entry.apiFootballSearchName, entry.apiFootballSearchCountry);

    if (!found) {
      console.warn(
        `COZULEMEDI: "${entry.name}" (${entry.apiFootballSearchName} / ${entry.apiFootballSearchCountry}) - API-Football'da bulunamadi, atlaniyor.`,
      );
      continue;
    }

    const { error } = await supabase.from("leagues").upsert(
      {
        name: entry.name,
        country: entry.country,
        api_football_id: found.apiFootballId,
        odds_api_sport_key: entry.oddsApiSportKey,
        current_season: found.currentSeason,
        active: true,
      },
      { onConflict: "api_football_id" },
    );

    if (error) {
      console.error(`HATA: "${entry.name}" kaydedilemedi:`, error.message);
    } else {
      console.log(`OK: "${entry.name}" -> api_football_id=${found.apiFootballId}, sezon=${found.currentSeason}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
