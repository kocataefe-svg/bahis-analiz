"use client";

import { useCoupon } from "@/lib/coupon-context";
import { formatPickLabel } from "@/lib/market-labels";
import styles from "./pick-badge.module.css";

export function PickBadge({
  matchId,
  matchLabel,
  pick,
}: {
  matchId: string;
  matchLabel: string;
  pick: { market: string; outcome: string; price: number };
}) {
  const { isSelected, togglePick } = useCoupon();
  const id = `${matchId}::${pick.market}::analiz::${pick.outcome}`;
  const selected = isSelected(id);

  return (
    <button
      type="button"
      onClick={() =>
        togglePick({ id, matchLabel, market: pick.market, outcome: pick.outcome, price: pick.price })
      }
      className={selected ? `${styles.badge} ${styles.badgeSelected}` : styles.badge}
    >
      Tahmin: {formatPickLabel(pick.market, pick.outcome)}
    </button>
  );
}
