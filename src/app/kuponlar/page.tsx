import { getSupabaseClient } from "@/lib/supabase";
import { getSharedCoupons } from "@/lib/db/shared-coupons";
import { getMatchResultsByIds } from "@/lib/db/match-results";
import { getMatchTeamsByIds } from "@/lib/db/matches";
import { getResolvedMatchesForStats } from "@/lib/db/resolved-matches";
import { computePersonaStats } from "@/lib/persona-stats";
import { resolvePickResult, type PickResultStatus } from "@/lib/result-resolver";
import { formatRelativeUpdate } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/market-labels";
import { PersonaStatsPanel } from "./persona-stats-panel";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<PickResultStatus, string> = {
  won: "Tuttu",
  lost: "Tutmadi",
  unknown: "",
};

export default async function KuponlarPage() {
  const supabase = getSupabaseClient();
  const [coupons, resolvedMatches] = await Promise.all([
    getSharedCoupons(supabase),
    getResolvedMatchesForStats(supabase),
  ]);
  const personaStats = computePersonaStats(resolvedMatches);

  const matchIds = [...new Set(coupons.flatMap((c) => c.picks.map((p) => p.matchId)).filter(Boolean))];
  const [resultsByMatchId, teamsByMatchId] = await Promise.all([
    getMatchResultsByIds(supabase, matchIds),
    getMatchTeamsByIds(supabase, matchIds),
  ]);

  function pickStatus(matchId: string, market: string, outcome: string): PickResultStatus {
    const result = resultsByMatchId.get(matchId);
    const teams = teamsByMatchId.get(matchId);
    if (!result || !teams) return "unknown";
    return resolvePickResult({ market, outcome }, result, teams.homeTeam, teams.awayTeam);
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Kuponlar</h1>
      <p className={styles.subtitle}>Herkesin paylastigi kuponlar - gercek para icermez.</p>

      <PersonaStatsPanel stats={personaStats} />

      {coupons.length === 0 ? (
        <p className={styles.empty}>Henuz paylasilan kupon yok.</p>
      ) : (
        <ul className={styles.list}>
          {coupons.map((c, i) => (
            <li key={c.id} className={styles.card} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <div className={styles.cardHeader}>
                <span className={styles.userName}>{c.userName}</span>
                <span className={styles.updatedAt}>{formatRelativeUpdate(c.createdAt)}</span>
              </div>
              <ul className={styles.picks}>
                {c.picks.map((p, i) => {
                  const status = p.matchId ? pickStatus(p.matchId, p.market, p.outcome) : "unknown";
                  return (
                    <li key={i} className={styles.pick}>
                      <span className={styles.pickMatch}>{p.matchLabel}</span>
                      <span className={styles.pickDetail}>
                        {MARKET_LABELS[p.market] ?? p.market}: {p.outcome} @ {p.price}
                        {status !== "unknown" && (
                          <span className={status === "won" ? styles.statusWon : styles.statusLost}>
                            {STATUS_LABEL[status]}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.total}>
                Toplam oran: <span>{Number(c.totalOdds).toFixed(2)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
