import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById } from "@/lib/db/matches";
import { getLeagueById } from "@/lib/db/leagues";
import { getLatestTeamStats, type LatestTeamStats } from "@/lib/db/team-stats";
import { getLatestOdds, getOddsHistory } from "@/lib/db/odds";
import { getLatestAnalysis } from "@/lib/db/ai-analyses";
import { getManualOddsForMatch } from "@/lib/db/manual-odds";
import { averagePricesByOutcome } from "@/lib/odds-chart";
import { compareManualToReference } from "@/lib/odds-comparison";
import { formatKickoffTime, formatRelativeUpdate } from "@/lib/format";
import { OddsChartView } from "./odds-chart-view";
import { ManualOddsForm } from "./manual-odds-form";
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
      <p>Kart cezasi: {stats.cards.length > 0 ? `${stats.cards.length} oyuncu cezali` : "veri toplanmiyor"}</p>
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

  const [league, teamStats, latestOdds, oddsHistory, analysis, manualOdds] = await Promise.all([
    getLeagueById(supabase, match.leagueId),
    getLatestTeamStats(supabase, match.id),
    getLatestOdds(supabase, match.id),
    getOddsHistory(supabase, match.id),
    getLatestAnalysis(supabase, match.id),
    getManualOddsForMatch(supabase, match.id),
  ]);

  const homeStats = teamStats.find((s) => s.team === "home");
  const awayStats = teamStats.find((s) => s.team === "away");

  const statsFetchedAt = [homeStats?.fetchedAt, awayStats?.fetchedAt]
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const manualComparisons =
    manualOdds.length > 0
      ? compareManualToReference(
          manualOdds.map((m) => ({ outcome: m.outcome, price: m.price })),
          averagePricesByOutcome(latestOdds),
        )
      : [];

  return (
    <main className={styles.page}>
      <p className={styles.league}>{league ? `${league.name} (${league.country})` : ""}</p>
      <h1 className={styles.title}>
        {match.homeTeam} - {match.awayTeam}
      </h1>
      <p className={styles.kickoff}>{formatKickoffTime(match.kickoffAt)}</p>

      <section className={styles.section}>
        <h2>Takim Durumu</h2>
        {statsFetchedAt && <p className={styles.updatedAt}>{formatRelativeUpdate(statsFetchedAt)}</p>}
        <div className={styles.statsGrid}>
          {renderTeamStats(match.homeTeam, homeStats)}
          {renderTeamStats(match.awayTeam, awayStats)}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Guncel Referans Oran</h2>
        {latestOdds[0]?.fetchedAt && (
          <p className={styles.updatedAt}>{formatRelativeUpdate(latestOdds[0].fetchedAt)}</p>
        )}
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
        <p className={styles.noData}>
          Bu grafik gercek bahis hacmini degil, periyodik oran olcumlerimizi gosterir.
        </p>
        <OddsChartView history={oddsHistory} />
      </section>

      <section className={styles.section}>
        <h2>AI Analiz</h2>
        {analysis?.generatedAt && (
          <p className={styles.updatedAt}>{formatRelativeUpdate(analysis.generatedAt)}</p>
        )}
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

      <section className={styles.section}>
        <h2>Manuel Oran Karsilastirma</h2>
        {manualOdds.length === 0 ? (
          <p className={styles.noData}>Henuz manuel oran girilmedi.</p>
        ) : (
          <>
            <ul className={styles.oddsList}>
              {manualOdds.map((m) => (
                <li key={m.id}>
                  {m.enteredBy}: {m.outcome} @ {m.price}
                </li>
              ))}
            </ul>
            {manualComparisons.length === 0 ? (
              <p className={styles.noData}>
                Bu mac icin referans oran mevcut olmadigindan karsilastirma yapilamiyor.
              </p>
            ) : (
              <ul className={styles.oddsList}>
                {manualComparisons.map((c) => (
                  <li key={c.outcome}>
                    {c.outcome}: siz {c.manualPrice}, referans {c.referencePrice.toFixed(2)} (fark{" "}
                    {c.diffPercent > 0 ? "+" : ""}
                    {c.diffPercent.toFixed(1)}%)
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <ManualOddsForm matchId={match.id} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
      </section>
    </main>
  );
}
