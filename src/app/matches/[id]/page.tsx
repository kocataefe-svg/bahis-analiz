import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById } from "@/lib/db/matches";
import { getLeagueById } from "@/lib/db/leagues";
import { getLatestOdds, getOddsHistory } from "@/lib/db/odds";
import { getLatestAnalysis } from "@/lib/db/ai-analyses";
import { getManualOddsForMatch } from "@/lib/db/manual-odds";
import { getMatchResearch } from "@/lib/db/match-research";
import { ensureExtraMarketsOdds } from "@/lib/odds-enrichment";
import { averagePricesByOutcome } from "@/lib/odds-chart";
import { compareManualToReference } from "@/lib/odds-comparison";
import { MARKET_LABELS } from "@/lib/market-labels";
import { formatKickoffTime, formatRelativeUpdate } from "@/lib/format";
import { OddsChartView } from "./odds-chart-view";
import { ManualOddsForm } from "./manual-odds-form";
import { ResearchButton } from "./research-button";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = getSupabaseClient();
  const match = await getMatchById(supabase, id);
  if (!match) {
    notFound();
  }

  const [league, initialLatestOdds, oddsHistory, analysis, manualOdds, research] = await Promise.all([
    getLeagueById(supabase, match.leagueId),
    getLatestOdds(supabase, match.id),
    getOddsHistory(supabase, match.id),
    getLatestAnalysis(supabase, match.id),
    getManualOddsForMatch(supabase, match.id),
    getMatchResearch(supabase, match.id),
  ]);

  let latestOdds = initialLatestOdds;
  if (league?.oddsApiSportKey) {
    const existingMarkets = new Set(latestOdds.map((o) => o.market));
    const insertedNew = await ensureExtraMarketsOdds(
      supabase,
      match.id,
      match.oddsApiEventId,
      league.oddsApiSportKey,
      existingMarkets,
    );
    if (insertedNew) {
      latestOdds = await getLatestOdds(supabase, match.id);
    }
  }

  const h2hOdds = latestOdds.filter((o) => o.market === "h2h");
  // Odds API bazi bookmaker'lar (orn. Betfair borsasi) icin istenmeyen ek
  // market anahtarlari (h2h_lay gibi) dondurebiliyor - sadece bildigimiz
  // pazarlari goster.
  const oddsByMarket = new Map<string, typeof latestOdds>();
  for (const o of latestOdds) {
    if (!(o.market in MARKET_LABELS)) continue;
    if (!oddsByMarket.has(o.market)) oddsByMarket.set(o.market, []);
    oddsByMarket.get(o.market)!.push(o);
  }

  const manualComparisons =
    manualOdds.length > 0
      ? compareManualToReference(
          manualOdds.map((m) => ({ outcome: m.outcome, price: m.price })),
          averagePricesByOutcome(h2hOdds),
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
        <h2>Sakatlik / Form / H2H Arastirmasi</h2>
        {research ? (
          <>
            <p className={styles.updatedAt}>{formatRelativeUpdate(research.generatedAt)}</p>
            <p className={styles.researchContent}>{research.content}</p>
            {research.sources.length > 0 && (
              <ul className={styles.sourcesList}>
                {research.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className={styles.noData}>
              Bu mac icin henuz arastirma yapilmadi. AI tarafindan web'de arastirilir, sonucu dogrulayin.
            </p>
            <ResearchButton matchId={match.id} />
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2>Guncel Referans Oran</h2>
        {h2hOdds[0]?.fetchedAt && <p className={styles.updatedAt}>{formatRelativeUpdate(h2hOdds[0].fetchedAt)}</p>}
        {latestOdds.length === 0 ? (
          <p className={styles.noData}>Oran verisi mevcut degil.</p>
        ) : (
          [...oddsByMarket.entries()].map(([market, quotes]) => (
            <div key={market}>
              <h3>{MARKET_LABELS[market] ?? market}</h3>
              <ul className={styles.oddsList}>
                {quotes.map((o, i) => (
                  <li key={`${market}-${o.bookmaker}-${o.outcome}-${i}`}>
                    {o.outcome}: {o.price} ({o.bookmaker})
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <h3>Oran Gecmisi (Taraf Bahsi)</h3>
        <p className={styles.noData}>
          Bu grafik gercek bahis hacmini degil, periyodik oran olcumlerimizi gosterir.
        </p>
        <OddsChartView history={oddsHistory.filter((h) => h.market === "h2h")} />
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
            <div>
              <h3>Surpriz Yorumcu</h3>
              <p>{analysis.surprisePickText}</p>
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
