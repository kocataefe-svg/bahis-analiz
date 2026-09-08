# Temel Altyapı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js projesinin iskeletini kurmak ve Supabase veritabanı şemasını oluşturmak — sonraki planların (veri çekme, AI analiz, arayüz) üzerine inşa edeceği temel.

**Architecture:** Next.js (App Router, TypeScript) tek proje olarak Vercel'e deploy edilecek. Supabase Postgres veritabanı, service-role key ile sunucu tarafından erişilecek (client'a asla anahtar gönderilmeyecek). Auth/şifre koruması yok — uygulama linki bilen herkese açık (kullanıcının tercihi, spec §8).

**Tech Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js`, Vitest (test), Vercel (hosting), Supabase (Postgres).

**Spec:** [docs/superpowers/specs/2026-09-08-bahis-analiz-app-design.md](../specs/2026-09-08-bahis-analiz-app-design.md)

## Global Constraints

- Tüm servisler ücretsiz kotada kalmalı — bu plana hiçbir ücretli servis eklenmez (spec §9).
- API anahtarları ve gizli değerler (Supabase service role key) yalnızca sunucu tarafı env variable olarak tutulur, client bundle'ına asla girmez (spec §8).
- Veritabanı tablo/kolon adları spec §6'daki isimlerle birebir eşleşmeli — sonraki planlar (veri çekme, AI analiz, arayüz) bu isimlere doğrudan referans verecek.
- Auth/şifre koruması yok (spec §8) — uygulama herkese açık.

## Prerequisites (Manuel — Kullanıcı Tarafından Yapılmalı)

Aşağıdaki hesaplar/anahtarlar üçüncü taraf servislerde hesap açmayı gerektiriyor — bunları ajan/executor oluşturamaz, kullanıcının kendisinin yapması gerekir. Bu planı (Plan 1) çalıştırmadan önce yalnızca ilk iki madde gerekli; diğerleri sonraki planlarda kullanılacak, şimdiden toplanabilir:

1. **Supabase hesabı + proje** (ücretsiz plan) — [supabase.com](https://supabase.com) üzerinden. Proje oluşturunca `Project URL` ve `service_role` key'i not edin (Settings → API).
2. **Vercel hesabı** (ücretsiz plan) — [vercel.com](https://vercel.com). GitHub hesabıyla giriş yapılabilir.
3. *(Sonraki planlar için)* API-Football hesabı (api-sports.io, ücretsiz plan), The Odds API hesabı (ücretsiz plan), Google AI Studio / Gemini API key (ücretsiz).

Bu plan boyunca `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` değerlerine ihtiyaç var — Task 2'de kullanılacak.

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

### Task 2: Supabase Bağlantısı + Veritabanı Şeması

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

### Task 3: Geçici Ana Sayfa + Deploy Kontrol Listesi

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: Task 2'deki `getSupabaseClient` (henüz sayfada kullanılmıyor, sonraki planda kullanılacak)
- Produces: Plan 4'te (Arayüz) gerçek lig/maç seçim arayüzüyle değiştirilecek yer tutucu ana sayfa

- [ ] **Step 1: Ana sayfayı geçici içerikle güncelle**

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>Bahis Analiz</h1>
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
Expected: Tüm testler (Supabase client, toplam 3 test) PASS.

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
2. Project Settings → Environment Variables kısmına şunları ekle (aynı `.env.local` değerleri): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy'u tetikle. Deploy tamamlanınca verilen URL'de ana sayfanın açıldığını doğrula.

## Self-Review Notlari

- **Spec kapsaması:** §2 (mimari) → Task 1/2, §6 (veri modeli) → Task 2 Step 5 (şema birebir kopyalandı), §8 (erişim/güvenlik: auth yok, anahtarlar sunucu tarafı) → Task 2 + Global Constraints. §3/§4/§5/§7 (veri kaynakları, lig listesi, kullanıcı akışı, hata yönetimi) bu plana girmiyor — onlar Plan 2/3/4'te ele alınacak, bu bilinçli bir kapsam ayrımı.
- **Placeholder taraması:** Tüm adımlarda gerçek kod var, "TODO"/"benzer şekilde" yok.
- **Tip tutarlılığı:** `getSupabaseClient(): SupabaseClient` imzası Task 2'de tanımlandı; sonraki planlar bunu aynı isimle içe aktaracak (`import { getSupabaseClient } from "@/lib/supabase"`).
