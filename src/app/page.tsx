import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeaguesForDisplay } from "@/lib/db/leagues";
import { getUpcomingMatchesWithLeague } from "@/lib/db/matches";
import { LeagueMatchList } from "./league-match-list";
import styles from "./page.module.css";

const HOME_WINDOW_DAYS = 14;
const HOME_MATCH_LIMIT = 300;

export default async function HomePage() {
  const supabase = getSupabaseClient();
  const [leagues, matches] = await Promise.all([
    getActiveLeaguesForDisplay(supabase),
    getUpcomingMatchesWithLeague(supabase, HOME_WINDOW_DAYS, HOME_MATCH_LIMIT),
  ]);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Bahis Analiz</h1>
      <p className={styles.subtitle}>
        Referans oranlar uluslararasi bookmaker&apos;lardan gelir, Iddaa/Bilyoner&apos;deki oranla birebir ayni
        degildir.
      </p>
      <LeagueMatchList leagues={leagues} matches={matches} />
    </main>
  );
}
