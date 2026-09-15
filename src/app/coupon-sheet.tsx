"use client";

import { useActionState } from "react";
import { useCoupon } from "@/lib/coupon-context";
import { useUserIdentity, KNOWN_USERS } from "@/lib/user-identity";
import { MARKET_LABELS } from "@/lib/market-labels";
import { shareCoupon, type ShareCouponState } from "@/app/kuponlar/actions";
import styles from "./coupon-sheet.module.css";

const initialShareState: ShareCouponState = { error: null, success: false };

export function CouponSheet({ onClose }: { onClose: () => void }) {
  const { picks, removePick, clear } = useCoupon();
  const { userName, setUserName } = useUserIdentity();
  const totalOdds = picks.reduce((acc, p) => acc * p.price, 1);

  const boundShare = shareCoupon.bind(
    null,
    userName ?? "",
    picks.map((p) => ({
      matchId: p.matchId,
      matchLabel: p.matchLabel,
      market: p.market,
      outcome: p.outcome,
      price: p.price,
    })),
    totalOdds,
  );
  const [shareState, shareAction, sharePending] = useActionState(boundShare, initialShareState);

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

            <div className={styles.shareSection}>
              <p className={styles.shareLabel}>Kimsin?</p>
              <div className={styles.nameChips}>
                {KNOWN_USERS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setUserName(name)}
                    className={
                      userName === name ? `${styles.nameChip} ${styles.nameChipSelected}` : styles.nameChip
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
              {shareState.success ? (
                <p className={styles.shareSuccess}>
                  Kuponun paylasildi - herkes &quot;Kuponlar&quot; sayfasindan gorebilir.
                </p>
              ) : (
                <form action={shareAction}>
                  {shareState.error && (
                    <p role="alert" className={styles.shareError}>
                      {shareState.error}
                    </p>
                  )}
                  <button type="submit" disabled={sharePending || !userName} className={styles.shareButton}>
                    {sharePending ? "Paylasiliyor..." : "Kuponu Paylas"}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
        <p className={styles.disclaimer}>Gercek para icermez, sadece eglence amacli takip.</p>
      </div>
    </div>
  );
}
