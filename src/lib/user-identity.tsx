"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const KNOWN_USERS = ["Volkan", "Batu", "Altuğ", "Koray", "Ata"] as const;

interface UserIdentityContextValue {
  userName: string | null;
  setUserName: (name: string) => void;
}

const UserIdentityContext = createContext<UserIdentityContextValue | null>(null);
const STORAGE_KEY = "bahis-analiz-kullanici";

export function UserIdentityProvider({ children }: { children: ReactNode }) {
  const [userName, setUserNameState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setUserNameState(stored);
    } catch {
      // localStorage kullanilamiyorsa isim secilmemis gibi davran
    }
  }, []);

  function setUserName(name: string) {
    setUserNameState(name);
    try {
      window.localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // yazilamiyorsa sadece bu oturumda hatirlanir
    }
  }

  return <UserIdentityContext.Provider value={{ userName, setUserName }}>{children}</UserIdentityContext.Provider>;
}

export function useUserIdentity(): UserIdentityContextValue {
  const ctx = useContext(UserIdentityContext);
  if (!ctx) throw new Error("useUserIdentity, UserIdentityProvider disinda kullanilamaz");
  return ctx;
}
