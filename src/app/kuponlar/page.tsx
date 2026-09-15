import { getSupabaseClient } from "@/lib/supabase";
import { getSharedCoupons } from "@/lib/db/shared-coupons";
import { formatRelativeUpdate } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/market-labels";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function KuponlarPage() {
  const supabase = getSupabaseClient();
  const coupons = await getSharedCoupons(supabase);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Kuponlar</h1>
      <p className={styles.subtitle}>Herkesin paylastigi kuponlar - gercek para icermez.</p>
      {coupons.length === 0 ? (
        <p className={styles.empty}>Henuz paylasilan kupon yok.</p>
      ) : (
        <ul className={styles.list}>
          {coupons.map((c) => (
            <li key={c.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.userName}>{c.userName}</span>
                <span className={styles.updatedAt}>{formatRelativeUpdate(c.createdAt)}</span>
              </div>
              <ul className={styles.picks}>
                {c.picks.map((p, i) => (
                  <li key={i} className={styles.pick}>
                    <span className={styles.pickMatch}>{p.matchLabel}</span>
                    <span className={styles.pickDetail}>
                      {MARKET_LABELS[p.market] ?? p.market}: {p.outcome} @ {p.price}
                    </span>
                  </li>
                ))}
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
