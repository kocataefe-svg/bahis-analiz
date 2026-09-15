import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseClient } from "../src/lib/supabase-core";
import { LEAGUE_CATALOG } from "../src/lib/league-catalog";

async function main() {
  const supabase = getSupabaseClient();

  for (const entry of LEAGUE_CATALOG) {
    const { error } = await supabase.from("leagues").upsert(
      {
        name: entry.name,
        country: entry.country,
        odds_api_sport_key: entry.oddsApiSportKey,
        active: true,
      },
      { onConflict: "name" },
    );

    if (error) {
      console.error(`HATA: "${entry.name}" kaydedilemedi:`, error.message);
    } else {
      console.log(`OK: "${entry.name}"`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
