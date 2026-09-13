"use client";

import { useState } from "react";
import Link from "next/link";
import type { DisplayLeague } from "@/lib/db/leagues";
import type { DisplayMatch } from "@/lib/db/matches";
import { formatKickoffTime } from "@/lib/format";
import styles from "./league-match-list.module.css";

export function LeagueMatchList({ leagues, matches }: { leagues: DisplayLeague[]; matches: DisplayMatch[] }) {
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<string>>(() => new Set(leagues.map((l) => l.id)));

  function toggleLeague(id: string) {
    setSelectedLeagueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const matchesByLeague = new Map<string, DisplayMatch[]>();
  for (const match of matches) {
    if (!selectedLeagueIds.has(match.leagueId)) continue;
    if (!matchesByLeague.has(match.leagueId)) matchesByLeague.set(match.leagueId, []);
    matchesByLeague.get(match.leagueId)!.push(match);
  }

  return (
    <div className={styles.container}>
      <fieldset className={styles.leagueFilter}>
        <legend>Ligler</legend>
        {leagues.map((league) => (
          <label key={league.id} className={styles.leagueCheckbox}>
            <input
              type="checkbox"
              checked={selectedLeagueIds.has(league.id)}
              onChange={() => toggleLeague(league.id)}
            />
            {league.name} ({league.country})
          </label>
        ))}
      </fieldset>

      <div className={styles.matchList}>
        {leagues.map((league) => {
          const leagueMatches = matchesByLeague.get(league.id);
          if (!leagueMatches || leagueMatches.length === 0) return null;
          return (
            <section key={league.id} className={styles.leagueSection}>
              <h2 className={styles.leagueName}>
                {league.name} <span className={styles.leagueCountry}>({league.country})</span>
              </h2>
              <ul className={styles.matches}>
                {leagueMatches.map((match) => (
                  <li key={match.id}>
                    <Link href={`/matches/${match.id}`} className={styles.matchLink}>
                      <span className={styles.teams}>
                        {match.homeTeam} - {match.awayTeam}
                      </span>
                      <span className={styles.kickoff}>{formatKickoffTime(match.kickoffAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {matchesByLeague.size === 0 && <p className={styles.empty}>Secili liglerde yaklasan mac yok.</p>}
      </div>
    </div>
  );
}
