"use client";

import { useCoupon } from "@/lib/coupon-context";
import styles from "./odds-chip.module.css";

export function OddsChip({
  matchId,
  matchLabel,
  market,
  outcome,
  price,
  bookmaker,
}: {
  matchId: string;
  matchLabel: string;
  market: string;
  outcome: string;
  price: number;
  bookmaker: string;
}) {
  const { isSelected, togglePick } = useCoupon();
  const id = `${matchId}::${market}::${bookmaker}::${outcome}`;
  const selected = isSelected(id);

  return (
    <button
      type="button"
      onClick={() => togglePick({ id, matchLabel, market, outcome, price })}
      className={selected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
    >
      <span className={styles.outcome}>{outcome}</span>
      <span className={styles.price}>{price}</span>
      <span className={styles.bookmaker}>{bookmaker}</span>
    </button>
  );
}
