import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseClient } from "../src/lib/supabase";
import { searchLeague } from "../src/lib/api-football";
import { LEAGUE_CATALOG } from "../src/lib/league-catalog";

async function main() {
  const supabase = getSupabaseClient();

  for (const entry of LEAGUE_CATALOG) {
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
