import type { AllPersonaStats, PersonaStats } from "@/lib/persona-stats";
import styles from "./persona-stats-panel.module.css";

const PERSONA_LABELS: { key: keyof AllPersonaStats; label: string }[] = [
  { key: "teamAnalyst", label: "Takim Analizcisi" },
  { key: "bettingAnalyst", label: "Bahis Analizcisi" },
  { key: "commentator", label: "Yorumcu" },
  { key: "surpriseCombo", label: "Surpriz Yorumcu" },
];

function formatRate(stats: PersonaStats): string {
  if (stats.total === 0) return "Henuz veri yok";
  const rate = Math.round((stats.won / stats.total) * 100);
  return `${stats.won}/${stats.total} isabet (%${rate})`;
}

export function PersonaStatsPanel({ stats }: { stats: AllPersonaStats }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>AI Tahmin Basarisi</h2>
      <p className={styles.subtitle}>Sonucu belli maclardan hesaplanir - ilk yari/gol atacak oyuncu haric.</p>
      <ul className={styles.list}>
        {PERSONA_LABELS.map(({ key, label }) => (
          <li key={key} className={styles.row}>
            <span className={styles.name}>{label}</span>
            <span className={styles.rate}>{formatRate(stats[key])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
