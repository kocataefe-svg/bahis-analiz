"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CouponPick {
  id: string;
  matchLabel: string;
  market: string;
  outcome: string;
  price: number;
}

interface CouponContextValue {
  picks: CouponPick[];
  isSelected: (id: string) => boolean;
  togglePick: (pick: CouponPick) => void;
  removePick: (id: string) => void;
  clear: () => void;
}

const CouponContext = createContext<CouponContextValue | null>(null);

const STORAGE_KEY = "bahis-analiz-kuponum";

export function CouponProvider({ children }: { children: ReactNode }) {
  const [picks, setPicks] = useState<CouponPick[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPicks(JSON.parse(raw));
    } catch {
      // localStorage kullanilamiyorsa (gizli sekme vb.) sessizce bos basla
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
    } catch {
      // yazilamiyorsa sessizce yut - kuponum sadece bu oturumda yasar
    }
  }, [picks, hydrated]);

  const togglePick = useCallback((pick: CouponPick) => {
    setPicks((prev) => {
      if (prev.some((p) => p.id === pick.id)) return prev.filter((p) => p.id !== pick.id);
      return [...prev, pick];
    });
  }, []);

  const removePick = useCallback((id: string) => {
    setPicks((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clear = useCallback(() => setPicks([]), []);

  const isSelected = useCallback((id: string) => picks.some((p) => p.id === id), [picks]);

  const value = useMemo(
    () => ({ picks, isSelected, togglePick, removePick, clear }),
    [picks, isSelected, togglePick, removePick, clear],
  );

  return <CouponContext.Provider value={value}>{children}</CouponContext.Provider>;
}

export function useCoupon(): CouponContextValue {
  const ctx = useContext(CouponContext);
  if (!ctx) throw new Error("useCoupon, CouponProvider disinda kullanilamaz");
  return ctx;
}
