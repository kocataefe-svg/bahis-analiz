"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCoupon } from "@/lib/coupon-context";
import { CouponSheet } from "./coupon-sheet";
import styles from "./app-shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { picks } = useCoupon();
  const [sheetOpen, setSheetOpen] = useState(false);
  const isHome = pathname === "/";

  return (
    <>
      <header className={styles.bar}>
        {!isHome ? (
          <button type="button" onClick={() => router.back()} className={styles.iconButton} aria-label="Geri">
            ←
          </button>
        ) : (
          <span className={styles.spacer} />
        )}
        <Link href="/" className={styles.brand}>
          Bahis Analiz
        </Link>
        <Link href="/kuponlar" className={styles.iconButton} aria-label="Kuponlar">
          📋
        </Link>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={styles.couponButton}
          aria-label="Kuponum"
        >
          🎟 <span>{picks.length}</span>
        </button>
      </header>
      <div className={styles.content}>{children}</div>
      {sheetOpen && <CouponSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
}
