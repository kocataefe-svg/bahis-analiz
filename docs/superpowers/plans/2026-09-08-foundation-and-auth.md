# Temel Altyapı & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js projesinin iskeletini kurmak, Supabase veritabanı şemasını oluşturmak ve tüm sayfaları koruyan paylaşılan-şifre auth sistemini çalışır hale getirmek.

**Architecture:** Next.js (App Router, TypeScript) tek proje olarak Vercel'e deploy edilecek. Supabase Postgres veritabanı, service-role key ile sunucu tarafından erişilecek (client'a asla anahtar gönderilmeyecek). Auth, tam üyelik sistemi yerine tek bir paylaşılan şifreye karşı HMAC imzalı, süresi dolan bir session cookie ile yapılacak — hem Node hem Edge runtime'da çalışması için Web Crypto API (`crypto.subtle`) kullanılacak.

**Tech Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js`, Vitest (test), Vercel (hosting), Supabase (Postgres).

**Spec:** [docs/superpowers/specs/2026-09-08-bahis-analiz-app-design.md](../specs/2026-09-08-bahis-analiz-app-design.md)

## Global Constraints

- Tüm servisler ücretsiz kotada kalmalı — bu plana hiçbir ücretli servis eklenmez (spec §9).
- API anahtarları ve gizli değerler (Supabase service role key, AUTH_SECRET, APP_SHARED_PASSWORD) yalnızca sunucu tarafı env variable olarak tutulur, client bundle'ına asla girmez (spec §8).
- Veritabanı tablo/kolon adları spec §6'daki isimlerle birebir eşleşmeli — sonraki planlar (veri çekme, AI analiz, arayüz) bu isimlere doğrudan referans verecek.
- Tam kullanıcı kayıt/üyelik sistemi yok — tek paylaşılan şifre yeterli (spec §8).

## Prerequisites (Manuel — Kullanıcı Tarafından Yapılmalı)

Aşağıdaki hesaplar/anahtarlar üçüncü taraf servislerde hesap açmayı gerektiriyor — bunları ajan/executor oluşturamaz, kullanıcının kendisinin yapması gerekir. Bu planı (Plan 1) çalıştırmadan önce yalnızca ilk iki madde gerekli; diğerleri sonraki planlarda kullanılacak, şimdiden toplanabilir:

1. **Supabase hesabı + proje** (ücretsiz plan) — [supabase.com](https://supabase.com) üzerinden. Proje oluşturunca `Project URL` ve `service_role` key'i not edin (Settings → API).
2. **Vercel hesabı** (ücretsiz plan) — [vercel.com](https://vercel.com). GitHub hesabıyla giriş yapılabilir.
3. *(Sonraki planlar için)* API-Football hesabı (api-sports.io, ücretsiz plan), The Odds API hesabı (ücretsiz plan), Google AI Studio / Gemini API key (ücretsiz).

Bu plan boyunca `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` değerlerine ihtiyaç var — Task 3'te kullanılacak.

---

### Task 1: Next.js Proje İskeleti

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `vitest.config.ts` (create-next-app + manuel ekleme)

**Interfaces:**
- Consumes: yok (ilk task)
- Produces: çalışan bir Next.js projesi; `npm run build`, `npm run dev`, `npm test` script'leri

- [ ] **Step 1: Next.js'i geçici bir klasöre scaffold et**

```bash
npx --yes create-next-app@latest tmp-app --typescript --app --eslint --src-dir --import-alias "@/*" --no-tailwind --use-npm --yes
```

- [ ] **Step 2: Üretilen dosyaları proje köküne taşı**

```bash
cp -r tmp-app/. .
rm -rf tmp-app
```

- [ ] **Step 3: package.json'daki proje adını düzelt**

`package.json` içinde `"name": "tmp-app"` satırını `"name": "bahis-analiz"` olarak değiştir.

- [ ] **Step 4: Vitest'i ekle**

```bash
npm install -D vitest
```

`vitest.config.ts` oluştur:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

`package.json` `scripts` bölümüne ekle:

```json
"test": "vitest run"
```

- [ ] **Step 5: Build'in çalıştığını doğrula**

Run: `npm run build`
Expected: Başarılı derleme, hata yok.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Next.js proje iskeletini olustur"
```

---

### Task 2: Auth Kütüphanesi (Şifre Doğrulama + Session Token)

**Files:**
- Create: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: yok (saf fonksiyonlar, Web Crypto API dışında bağımlılık yok)
- Produces:
  - `verifyPassword(submitted: string, expected: string): Promise<boolean>`
  - `createSessionToken(secret: string, expiresAtMs: number): Promise<string>`
  - `verifySessionToken(secret: string, token: string | undefined): Promise<boolean>`
  - Bu üç fonksiyon Task 4'te (login route + middleware) doğrudan kullanılacak.

- [ ] **Step 1: Başarısız testi yaz**

`src/lib/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken, verifyPassword } from "./auth";

describe("verifyPassword", () => {
  it("returns true for matching password", async () => {
    expect(await verifyPassword("secret123", "secret123")).toBe(true);
  });

  it("returns false for non-matching password", async () => {
    expect(await verifyPassword("wrong", "secret123")).toBe(false);
  });

  it("returns false for empty submitted password", async () => {
    expect(await verifyPassword("", "secret123")).toBe(false);
  });
});

describe("session token", () => {
  it("verifies a freshly created token", async () => {
    const token = await createSessionToken("test-secret", Date.now() + 60_000);
    expect(await verifySessionToken("test-secret", token)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken("test-secret", Date.now() - 1000);
    expect(await verifySessionToken("test-secret", token)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("secret-a", Date.now() + 60_000);
    expect(await verifySessionToken("secret-b", token)).toBe(false);
  });

  it("rejects an undefined token", async () => {
    expect(await verifySessionToken("test-secret", undefined)).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect(await verifySessionToken("test-secret", "not-a-valid-token")).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'` (dosya henüz yok).

- [ ] **Step 3: `src/lib/auth.ts` implementasyonunu yaz**

```ts
const encoder = new TextEncoder();

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bufferToHex(digest);
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifyPassword(submitted: string, expected: string): Promise<boolean> {
  if (!submitted) return false;
  const [subHash, expHash] = await Promise.all([sha256Hex(submitted), sha256Hex(expected)]);
  return timingSafeEqualHex(subHash, expHash);
}

export async function createSessionToken(secret: string, expiresAtMs: number): Promise<string> {
  const key = await getHmacKey(secret);
  const payload = String(expiresAtMs);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${bufferToHex(sigBuffer)}`;
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sigHex] = parts;

  const expiresAtMs = Number(payload);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const key = await getHmacKey(secret);
  const expectedSigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSigHex = bufferToHex(expectedSigBuffer);

  return timingSafeEqualHex(sigHex, expectedSigHex);
}
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: PASS — 8/8 test geçmeli.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: sifre dogrulama ve session token kutuphanesi"
```

---

### Task 3: Supabase Bağlantısı + Veritabanı Şeması

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `src/lib/supabase.test.ts`
- Create: `supabase/migrations/0001_init.sql`
- Create: `.env.local.example`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env variables
- Produces:
  - `getSupabaseClient(): SupabaseClient` — sonraki tüm planlar (veri çekme, AI analiz, arayüz) veritabanı erişimi için bunu kullanacak.
  - Tablolar: `leagues`, `matches`, `team_stats_snapshots`, `odds_snapshots`, `ai_analyses`, `manual_odds` (tam şema aşağıda) — sonraki planlar bu tablo/kolon adlarını birebir kullanacak.

- [ ] **Step 1: Başarısız testi yaz**

`src/lib/supabase.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getSupabaseClient } from "./supabase";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseClient", () => {
  it("throws when SUPABASE_URL is missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseClient()).toThrow();
  });

  it("returns a client with a .from method when both env vars are set", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const client = getSupabaseClient();
    expect(typeof client.from).toBe("function");
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: FAIL — `Cannot find module './supabase'`.

- [ ] **Step 3: Supabase JS client'ı kur ve `src/lib/supabase.ts` yaz**

```bash
npm install @supabase/supabase-js
```

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY env degiskeni tanimli degil");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: PASS — 3/3 test geçmeli.

- [ ] **Step 5: Veritabanı şema migration dosyasını oluştur**

`supabase/migrations/0001_init.sql`:

```sql
create extension if not exists pgcrypto;

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  api_football_id integer not null unique,
  odds_api_key text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  api_football_fixture_id integer not null unique,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index matches_league_id_idx on matches(league_id);
create index matches_kickoff_at_idx on matches(kickoff_at);

create table team_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team text not null check (team in ('home', 'away')),
  form text,
  injuries jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  last_matches jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create index team_stats_snapshots_match_id_idx on team_stats_snapshots(match_id);

create table odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  market text not null,
  outcome text not null,
  price numeric not null,
  fetched_at timestamptz not null default now()
);

create index odds_snapshots_match_id_idx on odds_snapshots(match_id);
create index odds_snapshots_fetched_at_idx on odds_snapshots(fetched_at);

create table ai_analyses (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_analyst_text text not null,
  betting_analyst_text text not null,
  commentator_text text not null,
  summary_text text not null,
  model_used text not null,
  generated_at timestamptz not null default now()
);

create index ai_analyses_match_id_idx on ai_analyses(match_id);

create table manual_odds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  entered_by text not null,
  market text not null,
  outcome text not null,
  price numeric not null,
  entered_at timestamptz not null default now()
);

create index manual_odds_match_id_idx on manual_odds(match_id);
```

- [ ] **Step 6: Migration'ı Supabase projesine uygula (manuel)**

Supabase Dashboard → SQL Editor → `supabase/migrations/0001_init.sql` içeriğini yapıştırıp çalıştırın. (Bu adım Supabase hesabınız üzerinden manuel yapılmalı — CLI kullanmak isterseniz `npx supabase db push` alternatif olarak kullanılabilir, ancak dashboard üzerinden yapıştırmak en basit yoldur.)

Doğrulama: Supabase Dashboard → Table Editor'de 6 tablonun (`leagues`, `matches`, `team_stats_snapshots`, `odds_snapshots`, `ai_analyses`, `manual_odds`) göründüğünü kontrol edin.

- [ ] **Step 7: `.env.local.example` oluştur**

```
# Auth
APP_SHARED_PASSWORD=
AUTH_SECRET=

# Supabase (Settings -> API)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Sonraki planlarda kullanilacak (simdilik bos birakilabilir)
API_FOOTBALL_KEY=
ODDS_API_KEY=
GEMINI_API_KEY=
```

`.gitignore` dosyasına `.env.local` satırının olduğunu doğrula (create-next-app varsayılan olarak ekler).

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts supabase/migrations/0001_init.sql .env.local.example package.json package-lock.json
git commit -m "feat: supabase client ve veritabani semasi"
```

---

### Task 4: Login Route + Middleware (Tüm Sayfaları Koru)

**Files:**
- Create: `src/app/api/login/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `middleware.ts` (proje kökü)

**Interfaces:**
- Consumes: `verifyPassword`, `createSessionToken`, `verifySessionToken` (Task 2'den), `APP_SHARED_PASSWORD`/`AUTH_SECRET` env variables
- Produces: `/login` sayfası ve `/api/login` endpoint'i; `session` adlı httpOnly cookie; middleware tüm route'ları (`/login`, `/api/login`, statik dosyalar hariç) korur.

- [ ] **Step 1: Login API route'unu yaz**

`src/app/api/login/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSessionToken } from "@/lib/auth";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Sifre gerekli" }, { status: 400 });
  }

  const expectedPassword = process.env.APP_SHARED_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!expectedPassword || !authSecret) {
    return NextResponse.json({ error: "Sunucu yapilandirma hatasi" }, { status: 500 });
  }

  const isValid = await verifyPassword(password, expectedPassword);
  if (!isValid) {
    return NextResponse.json({ error: "Sifre yanlis" }, { status: 401 });
  }

  const expiresAtMs = Date.now() + THIRTY_DAYS_MS;
  const token = await createSessionToken(authSecret, expiresAtMs);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAtMs),
    path: "/",
  });
  return response;
}
```

- [ ] **Step 2: Login sayfasını yaz**

`src/app/login/page.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Giris basarisiz");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Giris</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Sifre"
          style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
        />
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 8 }}>
          {submitting ? "Giris yapiliyor..." : "Giris yap"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Middleware'i yaz**

`middleware.ts` (proje kökünde, `src/` dışında — Next.js middleware konumu):

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Sunucu yapilandirma hatasi" }, { status: 500 });
  }

  const valid = await verifySessionToken(secret, token);
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Manuel doğrulama için env değerlerini ayarla**

`.env.local` dosyasını (git'e eklenmeyecek) `.env.local.example`'dan kopyala, `APP_SHARED_PASSWORD` ve `AUTH_SECRET` için rastgele değerler gir (örn. `openssl rand -hex 32` ile üretilebilir), `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` değerlerini Supabase projenizden girin.

```bash
cp .env.local.example .env.local
```

- [ ] **Step 5: Dev server'da manuel doğrulama**

Run: `npm run dev`
Tarayıcıda `http://localhost:3000` açıldığında `/login` sayfasına yönlendirilmeli. Doğru şifreyle giriş yapınca ana sayfaya (`/`) yönlendirilmeli. Yanlış şifreyle "Sifre yanlis" hatası görünmeli.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/login/route.ts src/app/login/page.tsx middleware.ts
git commit -m "feat: paylasilan sifre ile giris ve route koruma middleware'i"
```

---

### Task 5: Geçici Ana Sayfa + Deploy Kontrol Listesi

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: Task 4'teki middleware koruması (bu sayfa artık sadece giriş yapmış kullanıcıya görünür)
- Produces: Plan 4'te (Arayüz) gerçek lig/maç seçim arayüzüyle değiştirilecek yer tutucu ana sayfa

- [ ] **Step 1: Ana sayfayı geçici içerikle güncelle**

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>Giris basarili</h1>
      <p>
        Bu gecici bir sayfadir. Lig/mac secim arayuzu sonraki bir planda
        (Arayuz Implementation Plan) burayi degistirecek.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Tüm testlerin ve build'in geçtiğini doğrula**

Run: `npm test`
Expected: Tüm testler (auth + supabase, toplam 11 test) PASS.

Run: `npm run build`
Expected: Başarılı derleme.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: gecici ana sayfa"
```

- [ ] **Step 4: Deploy kontrol listesi (manuel, kullanıcı tarafından)**

Bu adım kod değil, kullanıcının Vercel Dashboard üzerinden yapması gereken tek seferlik kurulum:

1. Vercel Dashboard → "Add New Project" → bu Git deposunu bağla.
2. Project Settings → Environment Variables kısmına şunları ekle (aynı `.env.local` değerleri): `APP_SHARED_PASSWORD`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy'u tetikle. Deploy tamamlanınca verilen URL'de `/login` sayfasının açıldığını, doğru şifreyle giriş yapılabildiğini doğrula.

## Self-Review Notlari

- **Spec kapsaması:** §2 (mimari) → Task 1/3, §6 (veri modeli) → Task 3 Step 5 (şema birebir kopyalandı), §8 (erişim/güvenlik) → Task 2 + Task 4. §3/§4/§5/§7 (veri kaynakları, lig listesi, kullanıcı akışı, hata yönetimi) bu plana girmiyor — onlar Plan 2/3/4'te ele alınacak, bu bilinçli bir kapsam ayrımı.
- **Placeholder taraması:** Tüm adımlarda gerçek kod var, "TODO"/"benzer şekilde" yok.
- **Tip tutarlılığı:** `getSupabaseClient(): SupabaseClient` imzası Task 3'te tanımlandı; sonraki planlar bunu aynı isimle içe aktaracak (`import { getSupabaseClient } from "@/lib/supabase"`). `verifyPassword`/`createSessionToken`/`verifySessionToken` imzaları Task 2 ile Task 4 arasında birebir aynı.
