import { buildOddsChartSeries, type OddsHistoryPoint } from "@/lib/odds-chart";
import styles from "./page.module.css";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 100;
const SERIES_COLORS = ["#2563eb", "#6b7280", "#dc2626"];

export function OddsChartView({ history }: { history: OddsHistoryPoint[] }) {
  const series = buildOddsChartSeries(history, CHART_WIDTH, CHART_HEIGHT);

  if (series.length === 0) {
    return <p className={styles.noData}>Oran gecmisi verisi henuz yok.</p>;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height={CHART_HEIGHT}
        role="img"
        aria-label="Oran gecmisi grafigi"
      >
        {series.map((s, i) => (
          <polyline
            key={s.outcome}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
          />
        ))}
      </svg>
      <ul className={styles.chartLegend}>
        {series.map((s, i) => (
          <li key={s.outcome} style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
            {s.outcome}
          </li>
        ))}
      </ul>
    </div>
  );
}
