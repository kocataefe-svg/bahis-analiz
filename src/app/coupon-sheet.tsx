"use client";

import { useCoupon } from "@/lib/coupon-context";
import { MARKET_LABELS } from "@/lib/market-labels";
import styles from "./coupon-sheet.module.css";

export function CouponSheet({ onClose }: { onClose: () => void }) {
  const { picks, removePick, clear } = useCoupon();
  const totalOdds = picks.reduce((acc, p) => acc * p.price, 1);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Kuponum ({picks.length})</h2>
          <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Kapat">
            ✕
          </button>
        </div>
        {picks.length === 0 ? (
          <p className={styles.empty}>Henuz secim yok - bir mactaki orana dokunarak ekleyebilirsin.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {picks.map((p) => (
                <li key={p.id} className={styles.item}>
                  <div>
                    <p className={styles.matchLabel}>{p.matchLabel}</p>
                    <p className={styles.pickLabel}>
                      {MARKET_LABELS[p.market] ?? p.market}: {p.outcome} @ {p.price}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePick(p.id)}
                    className={styles.removeButton}
                    aria-label="Kaldir"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.footer}>
              <p className={styles.total}>
                Toplam oran: <span>{totalOdds.toFixed(2)}</span>
              </p>
              <button type="button" onClick={clear} className={styles.clearButton}>
                Temizle
              </button>
            </div>
          </>
        )}
        <p className={styles.disclaimer}>Gercek para icermez, sadece eglence amacli takip.</p>
      </div>
    </div>
  );
}
