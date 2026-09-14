import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById } from "@/lib/db/matches";
import { getLeagueById } from "@/lib/db/leagues";
import { getLatestTeamStats, type LatestTeamStats } from "@/lib/db/team-stats";
import { getLatestOdds } from "@/lib/db/odds";
import { getOddsHistory } from "@/lib/db/odds";
import { getLatestAnalysis } from "@/lib/db/ai-analyses";
import { formatKickoffTime } from "@/lib/format";
import { OddsChartView } from "./odds-chart-view";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface RecentMatchShape {
  opponent?: string;
  goalsFor?: number;
  goalsAgainst?: number;
  result?: string;
}

function renderTeamStats(label: string, stats: LatestTeamStats | undefined) {
  if (!stats) {
    return (
      <div className={styles.teamStats}>
        <h3>{label}</h3>
        <p className={styles.noData}>Bu takim icin istatistik verisi mevcut degil.</p>
      </div>
    );
  }

  const lastMatches = stats.lastMatches as RecentMatchShape[];

  return (
    <div className={styles.teamStats}>
      <h3>{label}</h3>
      <p>Son form: {stats.form || "bilinmiyor"}</p>
      <p>Sakatlik/cezali sayisi: {stats.injuries.length}</p>
      <p>Kart cezasi sayisi: {stats.cards.length}</p>
      {lastMatches.length > 0 ? (
        <ul className={styles.recentMatches}>
          {lastMatches.map((m, i) => (
            <li key={i}>
              {m.opponent ?? "?"}: {m.goalsFor ?? "?"}-{m.goalsAgainst ?? "?"} ({m.result ?? "?"})
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noData}>Son mac verisi mevcut degil.</p>
      )}
    </div>
  );
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = getSupabaseClient();
  const match = await getMatchById(supabase, id);
  if (!match) {
    notFound();
  }

  const [league, teamStats, latestOdds, oddsHistory, analysis] = await Promise.all([
    getLeagueById(supabase, match.leagueId),
    getLatestTeamStats(supabase, match.id),
    getLatestOdds(supabase, match.id),
    getOddsHistory(supabase, match.id),
    getLatestAnalysis(supabase, match.id),
  ]);

  const homeStats = teamStats.find((s) => s.team === "home");
  const awayStats = teamStats.find((s) => s.team === "away");

  return (
    <main className={styles.page}>
      <p className={styles.league}>{league ? `${league.name} (${league.country})` : ""}</p>
      <h1 className={styles.title}>
        {match.homeTeam} - {match.awayTeam}
      </h1>
      <p className={styles.kickoff}>{formatKickoffTime(match.kickoffAt)}</p>

      <section className={styles.section}>
        <h2>Takim Durumu</h2>
        <div className={styles.statsGrid}>
          {renderTeamStats(match.homeTeam, homeStats)}
          {renderTeamStats(match.awayTeam, awayStats)}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Guncel Referans Oran</h2>
        {latestOdds.length === 0 ? (
          <p className={styles.noData}>Oran verisi mevcut degil.</p>
        ) : (
          <ul className={styles.oddsList}>
            {latestOdds.map((o, i) => (
              <li key={`${o.bookmaker}-${o.outcome}-${i}`}>
                {o.outcome}: {o.price} ({o.bookmaker})
              </li>
            ))}
          </ul>
        )}
        <h3>Oran Gecmisi</h3>
        <OddsChartView history={oddsHistory} />
      </section>

      <section className={styles.section}>
        <h2>AI Analiz</h2>
        {!analysis ? (
          <p className={styles.noData}>Bu mac icin analiz henuz uretilmedi.</p>
        ) : (
          <div className={styles.analysis}>
            <p className={styles.summary}>{analysis.summaryText}</p>
            <div>
              <h3>Takim Analizcisi</h3>
              <p>{analysis.teamAnalystText}</p>
            </div>
            <div>
              <h3>Bahis Analizcisi</h3>
              <p>{analysis.bettingAnalystText}</p>
            </div>
            <div>
              <h3>Yorumcu</h3>
              <p>{analysis.commentatorText}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
