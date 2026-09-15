import { buildOddsChartSeries, getPriceBounds, type OddsHistoryPoint } from "@/lib/odds-chart";
import { formatShortDateTime } from "@/lib/format";
import styles from "./page.module.css";

const PLOT_WIDTH = 260;
const PLOT_HEIGHT = 100;
const MARGIN_LEFT = 36;
const MARGIN_BOTTOM = 18;
const MARGIN_TOP = 6;
const MARGIN_RIGHT = 6;
const SVG_WIDTH = PLOT_WIDTH + MARGIN_LEFT + MARGIN_RIGHT;
const SVG_HEIGHT = PLOT_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM;
const SERIES_COLORS = ["#2563eb", "#6b7280", "#dc2626", "#16a34a"];

export function OddsChartView({ history }: { history: OddsHistoryPoint[] }) {
  const series = buildOddsChartSeries(history, PLOT_WIDTH, PLOT_HEIGHT);
  const bounds = getPriceBounds(history);

  if (series.length === 0 || !bounds) {
    return <p className={styles.noData}>Oran gecmisi verisi henuz yok.</p>;
  }

  const firstFetchedAt = series[0].points[0]?.fetchedAt;
  const lastFetchedAt = series[0].points[series[0].points.length - 1]?.fetchedAt;
  const midPrice = (bounds.min + bounds.max) / 2;

  return (
    <div>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        height={SVG_HEIGHT}
        role="img"
        aria-label="Oran gecmisi grafigi"
      >
        {/* Y ekseni: fiyat degerleri */}
        <text x={MARGIN_LEFT - 4} y={MARGIN_TOP + 4} textAnchor="end" className={styles.chartAxisLabel}>
          {bounds.max.toFixed(2)}
        </text>
        <text
          x={MARGIN_LEFT - 4}
          y={MARGIN_TOP + PLOT_HEIGHT / 2 + 3}
          textAnchor="end"
          className={styles.chartAxisLabel}
        >
          {midPrice.toFixed(2)}
        </text>
        <text x={MARGIN_LEFT - 4} y={MARGIN_TOP + PLOT_HEIGHT} textAnchor="end" className={styles.chartAxisLabel}>
          {bounds.min.toFixed(2)}
        </text>
        {/* Yatay referans cizgileri */}
        <line
          x1={MARGIN_LEFT}
          y1={MARGIN_TOP}
          x2={MARGIN_LEFT + PLOT_WIDTH}
          y2={MARGIN_TOP}
          className={styles.chartGridLine}
        />
        <line
          x1={MARGIN_LEFT}
          y1={MARGIN_TOP + PLOT_HEIGHT / 2}
          x2={MARGIN_LEFT + PLOT_WIDTH}
          y2={MARGIN_TOP + PLOT_HEIGHT / 2}
          className={styles.chartGridLine}
        />
        <line
          x1={MARGIN_LEFT}
          y1={MARGIN_TOP + PLOT_HEIGHT}
          x2={MARGIN_LEFT + PLOT_WIDTH}
          y2={MARGIN_TOP + PLOT_HEIGHT}
          className={styles.chartGridLine}
        />
        <g transform={`translate(${MARGIN_LEFT}, ${MARGIN_TOP})`}>
          {series.map((s, i) => (
            <polyline
              key={s.outcome}
              points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
            />
          ))}
        </g>
        {/* X ekseni: ilk ve son olcum tarihi */}
        {firstFetchedAt && (
          <text x={MARGIN_LEFT} y={SVG_HEIGHT - 2} textAnchor="start" className={styles.chartAxisLabel}>
            {formatShortDateTime(firstFetchedAt)}
          </text>
        )}
        {lastFetchedAt && (
          <text
            x={MARGIN_LEFT + PLOT_WIDTH}
            y={SVG_HEIGHT - 2}
            textAnchor="end"
            className={styles.chartAxisLabel}
          >
            {formatShortDateTime(lastFetchedAt)}
          </text>
        )}
      </svg>
      <ul className={styles.chartLegend}>
        {series.map((s, i) => {
          const first = s.points[0]?.price;
          const last = s.points[s.points.length - 1]?.price;
          const trend = last > first ? "↑" : last < first ? "↓" : "→";
          return (
            <li key={s.outcome} style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
              {s.outcome}: {first?.toFixed(2)} {trend} {last?.toFixed(2)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
