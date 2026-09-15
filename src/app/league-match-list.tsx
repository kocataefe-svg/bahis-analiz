"use client";

import { useState } from "react";
import Link from "next/link";
import type { DisplayLeague } from "@/lib/db/leagues";
import type { DisplayMatch } from "@/lib/db/matches";
import { formatDayHeading, formatTimeOnly } from "@/lib/format";
import styles from "./league-match-list.module.css";

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
}

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

  const leagueById = new Map(leagues.map((l) => [l.id, l]));

  // matches gelirken kickoff_at'e gore artan sirada geldigi icin (bkz.
  // getUpcomingMatchesWithLeague) Map'e ekleme sirasi da kronolojik oluyor -
  // ayrica bir sort gerekmiyor.
  const matchesByDay = new Map<string, DisplayMatch[]>();
  for (const match of matches) {
    if (!selectedLeagueIds.has(match.leagueId)) continue;
    const key = dayKey(match.kickoffAt);
    if (!matchesByDay.has(key)) matchesByDay.set(key, []);
    matchesByDay.get(key)!.push(match);
  }

  return (
    <div className={styles.container}>
      <details className={styles.leagueFilter}>
        <summary>Ligler ({selectedLeagueIds.size}/{leagues.length})</summary>
        <div className={styles.leagueCheckboxes}>
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
        </div>
      </details>

      <div className={styles.matchList}>
        {[...matchesByDay.entries()].map(([day, dayMatches]) => (
          <section key={day} className={styles.daySection}>
            <h2 className={styles.dayHeading}>{formatDayHeading(dayMatches[0].kickoffAt)}</h2>
            <ul className={styles.matches}>
              {dayMatches.map((match, i) => {
                const league = leagueById.get(match.leagueId);
                return (
                  <li key={match.id} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                    <Link href={`/matches/${match.id}`} className={styles.matchLink}>
                      <span className={styles.matchInfo}>
                        {league && <span className={styles.leagueTag}>{league.name}</span>}
                        <span className={styles.teams}>
                          {match.homeTeam} - {match.awayTeam}
                        </span>
                      </span>
                      <span className={styles.kickoff}>{formatTimeOnly(match.kickoffAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {matchesByDay.size === 0 && <p className={styles.empty}>Secili liglerde yaklasan mac yok.</p>}
      </div>
    </div>
  );
}
