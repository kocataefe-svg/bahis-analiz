# Odds-Only Mimari + Gemini Araştırma Butonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API-Football'u (ücretsiz planı güncel sezona hiç erişemediği için) tamamen kaldırmak; fikstürü The Odds API'nin kendi event listesinden almak; sakatlık/form/H2H verisini arka plan senkronundan çıkarıp maç detay sayfasında tek tıkla tetiklenen, sonucu kalıcı olarak saklanan bir Gemini (Google Search grounding) araştırmasına dönüştürmek.

**Architecture:** `sync/odds` route'u artık tek Odds API çağrısından hem maçı (event `id` ile, isim eşleştirme yok) hem oranı kaydediyor. `sync/matches` ve `sync/stats` route'ları, `api-football.ts`, ve `team_stats_snapshots` tablosu tamamen kaldırılıyor. Yeni `match_research` tablosu + `/matches/[id]` sayfasındaki "Araştır" butonu, Gemini'nin `googleSearch` aracıyla genel spor haberi kaynaklarını tarayıp sakatlık/son 5 maç/H2H özetini kaydediyor; aynı maça ikinci kez tıklanınca yeniden sorgulanmıyor.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres), The Odds API, Gemini (`@google/genai`), CSS Modules, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-08-bahis-analiz-app-design.md](../specs/2026-09-08-bahis-analiz-app-design.md) (§3, §4, §6, §7 bu plan tarafından uygulanıyor)

## Global Constraints

- The Odds API kredi bütçesi: 13 lig × 1 piyasa (`h2h`) × 1 bölge (`eu`) × günde 1 senkron × 30 gün ≈ 390 kredi/ay (500 kredi/ay kotasının içinde). Senkron sıklığını artırma.
- Gemini modeli her iki kullanım için de `gemini-3.5-flash-lite`. Arka plan analizi `ai.interactions.create({ model, input, response_format: {...} })` ile, isteğe bağlı araştırma `ai.models.generateContent({ model, contents, config: { tools: [{ googleSearch: {} }] } })` ile çağrılır — iki farklı SDK metodu, birbirinin yerine kullanılmaz.
- TFF 1. Lig tamamen kapsam dışı: katalogda, DB'de, hiçbir yerde kalmayacak.
- Kod içi hata mesajları ve `console.warn`/`console.error` metinleri ASCII Türkçe (aksansız: "alinamadi", "kaydedilemedi"); kullanıcıya gösterilen UI metinleri düzgün Türkçe aksan kullanır (mevcut proje kuralı, örn. `league-catalog.ts`, `page.tsx`).
- CSS Modules kullanılıyor, Tailwind yok. Yeni client component'ler mevcut `manual-odds-form.tsx`/`.module.css` deseni izler (`useActionState` + `.bind(null, ...)`).
- Dinamik sayfalarda (`src/app/page.tsx`, `src/app/matches/[id]/page.tsx`) `export const dynamic = "force-dynamic"` zaten var, dokunulmuyor.
- Supabase migration'ları bu projede otomatik çalıştırılmıyor — kullanıcı Supabase SQL editöründen elle uyguluyor (0001/0002'de olduğu gibi). Yeni migration dosyası test edilemez, sadece SQL doğruluğu gözden geçirilir.
- Her kaldırılan kaynak dosyanın test dosyası da aynı task'ta silinir; hiçbir task'ın sonunda `npm test` kırık import bırakmaz.

---

### Task 1: DB migration — API-Football kolonlarını kaldır, `match_research` ekle

**Files:**
- Create: `supabase/migrations/0003_retire_api_football.sql`

**Interfaces:**
- Consumes: mevcut `leagues`, `matches`, `team_stats_snapshots` şeması (`supabase/migrations/0001_init.sql`).
- Produces: `matches.odds_api_event_id` (text, unique, not null), `leagues.name` üzerinde unique constraint (Task 2'nin seed script'i bunu upsert conflict key olarak kullanacak), `match_research` tablosu (`match_id` unique, `content`, `sources` jsonb, `model_used`, `generated_at`). Sonraki tüm task'lar bu kolon/tablo adlarını kullanır.

- [ ] **Step 1: Migration dosyasını yaz**

```sql
begin;

-- API-Football tamamen kaldirildi (ucretsiz plan guncel sezona erisemiyor).
-- Fikstur artik The Odds API'nin event id'siyle geliyor, mac esleme yok.
-- Onceki senkronlar hep 0 mac uretti, bu yuzden matches tablosu guvenle
-- bosaltilabilir (cascade ile bagli odds_snapshots/ai_analyses/manual_odds/
-- team_stats_snapshots satirlari da temizlenir).
truncate table matches cascade;

delete from leagues where name = 'TFF 1. Lig';

alter table leagues
  drop column api_football_id,
  drop column current_season;

alter table leagues
  add constraint leagues_name_key unique (name);

alter table matches
  drop column api_football_fixture_id,
  drop column home_team_api_id,
  drop column away_team_api_id,
  add column odds_api_event_id text not null unique;

drop table if exists team_stats_snapshots;

create table if not exists match_research (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  model_used text not null,
  generated_at timestamptz not null default now()
);

create index if not exists match_research_match_id_idx on match_research(match_id);

alter table match_research enable row level security;

commit;
```

- [ ] **Step 2: Gözden geçir**

Dosyayı oku, `0001_init.sql`'deki kolon adlarıyla (`api_football_fixture_id`, `home_team_api_id`, `away_team_api_id`, `api_football_id`, `current_season`) birebir eşleştiğini doğrula. `npm test` çalıştırmaya gerek yok (SQL dosyası, test edilmiyor).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_retire_api_football.sql
git commit -m "feat: API-Football kolonlarini kaldiran ve match_research ekleyen migration"
```

---

### Task 2: Lig kataloğu ve seed script'i — API-Football bağımlılığını kaldır

**Files:**
- Modify: `src/lib/league-catalog.ts`
- Modify: `src/lib/db/leagues.ts`
- Modify: `src/lib/db/leagues.test.ts`
- Modify: `scripts/seed-leagues.ts`

**Interfaces:**
- Consumes: Task 1'in `leagues.name` unique constraint'i (seed upsert bunu conflict key olarak kullanır).
- Produces: `LeagueCatalogEntry { name, country, oddsApiSportKey }`, `SyncLeague { id, oddsApiSportKey }` — Task 5 (`sync/odds`) bu şekli kullanır.

- [ ] **Step 1: `league-catalog.ts`'i sadeleştir, TFF 1. Lig'i çıkar**

```typescript
export interface LeagueCatalogEntry {
  name: string;
  country: string;
  oddsApiSportKey: string | null;
}

export const LEAGUE_CATALOG: LeagueCatalogEntry[] = [
  { name: "Premier League", country: "İngiltere", oddsApiSportKey: "soccer_epl" },
  { name: "Championship", country: "İngiltere", oddsApiSportKey: "soccer_efl_champ" },
  { name: "La Liga", country: "İspanya", oddsApiSportKey: "soccer_spain_la_liga" },
  { name: "Serie A", country: "İtalya", oddsApiSportKey: "soccer_italy_serie_a" },
  { name: "Bundesliga", country: "Almanya", oddsApiSportKey: "soccer_germany_bundesliga" },
  { name: "Ligue 1", country: "Fransa", oddsApiSportKey: "soccer_france_ligue_one" },
  { name: "Süper Lig", country: "Türkiye", oddsApiSportKey: "soccer_turkey_super_league" },
  { name: "Eliteserien", country: "Norveç", oddsApiSportKey: "soccer_norway_eliteserien" },
  { name: "Allsvenskan", country: "İsveç", oddsApiSportKey: "soccer_sweden_allsvenskan" },
  { name: "Super League", country: "İsviçre", oddsApiSportKey: "soccer_switzerland_superleague" },
  { name: "Eredivisie", country: "Hollanda", oddsApiSportKey: "soccer_netherlands_eredivisie" },
  { name: "Şampiyonlar Ligi", country: "Avrupa", oddsApiSportKey: "soccer_uefa_champs_league" },
  { name: "Avrupa Ligi", country: "Avrupa", oddsApiSportKey: "soccer_uefa_europa_league" },
  {
    name: "Milli Maçlar (Dünya Kupası Elemeleri - Avrupa)",
    country: "Avrupa",
    oddsApiSportKey: "soccer_fifa_world_cup_qualifiers_europe",
  },
];
```

- [ ] **Step 2: `leagues.ts`'teki `SyncLeague`/`getActiveLeagues`'i sadeleştir**

`DisplayLeague`, `getActiveLeaguesForDisplay`, `getLeagueById` fonksiyonlarına dokunma (aynı kalıyor). Sadece `SyncLeague` interface'i ve `getActiveLeagues`'i değiştir:

```typescript
export interface SyncLeague {
  id: string;
  oddsApiSportKey: string | null;
}

export async function getActiveLeagues(supabase: SupabaseClient): Promise<SyncLeague[]> {
  const { data, error } = await supabase.from("leagues").select("id, odds_api_sport_key").eq("active", true);

  if (error) throw new Error(`Ligler alinamadi: ${error.message}`);

  interface RawLeagueRow {
    id: string;
    odds_api_sport_key: string | null;
  }

  return ((data ?? []) as RawLeagueRow[]).map((row) => ({
    id: row.id,
    oddsApiSportKey: row.odds_api_sport_key,
  }));
}
```

- [ ] **Step 3: `leagues.test.ts`'teki `getActiveLeagues` testini güncelle**

`describe("getActiveLeagues", ...)` bloğunu şununla değiştir (diğer `describe` blokları — `getActiveLeaguesForDisplay`, `getLeagueById` — aynen kalır):

```typescript
describe("getActiveLeagues", () => {
  it("maps rows to camelCase and filters by active=true", async () => {
    const supabase = createSupabaseMock({
      data: [
        { id: "l1", odds_api_sport_key: "soccer_epl" },
        { id: "l2", odds_api_sport_key: null },
      ],
      error: null,
    });

    const result = await getActiveLeagues(supabase);

    expect(supabase.from).toHaveBeenCalledWith("leagues");
    expect(supabase.eq).toHaveBeenCalledWith("active", true);
    expect(result).toEqual([
      { id: "l1", oddsApiSportKey: "soccer_epl" },
      { id: "l2", oddsApiSportKey: null },
    ]);
  });

  it("throws when the query fails", async () => {
    const supabase = createSupabaseMock({ data: null, error: { message: "boom" } });
    await expect(getActiveLeagues(supabase)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 4: `scripts/seed-leagues.ts`'i API-Football çağrısı olmadan yeniden yaz**

```typescript
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseClient } from "../src/lib/supabase-core";
import { LEAGUE_CATALOG } from "../src/lib/league-catalog";

async function main() {
  const supabase = getSupabaseClient();

  for (const entry of LEAGUE_CATALOG) {
    const { error } = await supabase.from("leagues").upsert(
      {
        name: entry.name,
        country: entry.country,
        odds_api_sport_key: entry.oddsApiSportKey,
        active: true,
      },
      { onConflict: "name" },
    );

    if (error) {
      console.error(`HATA: "${entry.name}" kaydedilemedi:`, error.message);
    } else {
      console.log(`OK: "${entry.name}"`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test`
Expected: PASS (tüm test dosyaları, özellikle `src/lib/db/leagues.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/league-catalog.ts src/lib/db/leagues.ts src/lib/db/leagues.test.ts scripts/seed-leagues.ts
git commit -m "feat: lig katalogunu ve seed scriptini API-Football'suz hale getir"
```

---

### Task 3: `odds-api.ts` — event `id`'sini döndür

**Files:**
- Modify: `src/lib/odds-api.ts`
- Modify: `src/lib/odds-api.test.ts`

**Interfaces:**
- Consumes: The Odds API `/v4/sports/{sport}/odds` yanıtındaki her event objesinin `id` alanı (doğrulandı — stabil, `/v4/sports/{sport}/events` ve skor yanıtlarıyla aynı id).
- Produces: `OddsQuote.eventId` — Task 4 ve Task 5 bunu maç eşleme anahtarı olarak kullanır (isim/saat eşleştirmesi yerine).

- [ ] **Step 1: `OddsQuote` ve `RawOddsEvent`'e `eventId`/`id` ekle**

`src/lib/odds-api.ts` içinde:

```typescript
export interface OddsQuote {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  market: string;
  outcome: string;
  price: number;
}
```

```typescript
interface RawOddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: RawOddsBookmaker[];
}
```

`getOddsForSport` içindeki quote push'unu güncelle (`eventId: event.id` eklenir):

```typescript
          quotes.push({
            eventId: event.id,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            commenceTime: event.commence_time,
            bookmaker: bookmaker.key,
            market: market.key,
            outcome: outcome.name,
            price: outcome.price,
          });
```

- [ ] **Step 2: `odds-api.test.ts`'i güncelle**

İlk testteki mock event objesine `id: "evt1"` ekle ve beklenen üç quote'un her birine `eventId: "evt1"` ekle:

```typescript
  it("flattens events/bookmakers/markets/outcomes into a flat quote list", async () => {
    mockFetchOnce([
      {
        id: "evt1",
        home_team: "Manchester City",
        away_team: "Arsenal",
        commence_time: "2026-09-20T15:00:00Z",
        bookmakers: [
          {
            key: "pinnacle",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Manchester City", price: 1.8 },
                  { name: "Arsenal", price: 4.2 },
                  { name: "Draw", price: 3.6 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const result = await getOddsForSport("soccer_epl");
    expect(result).toEqual([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Manchester City",
        price: 1.8,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Draw",
        price: 3.6,
      },
    ]);
  });
```

Diğer üç test (`returns an empty array when the request fails`, `throws when ODDS_API_KEY is not set`, `returns an empty array when fetch rejects with a network error`) değişmeden kalır.

- [ ] **Step 3: Testleri çalıştır**

Run: `npm test -- odds-api`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/odds-api.ts src/lib/odds-api.test.ts
git commit -m "feat: odds-api'ye event id ekle"
```

---

### Task 4: `db/matches.ts` — `odds_api_event_id` ile yeniden yaz

**Files:**
- Modify: `src/lib/db/matches.ts`
- Modify: `src/lib/db/matches.test.ts`

**Interfaces:**
- Consumes: Task 1'in `matches.odds_api_event_id` kolonu.
- Produces: `upsertMatches(supabase, rows): Promise<UpsertedMatch[]>` (artık id döndürüyor — Task 5 bunu kullanır), `SyncMatch { id, homeTeam, awayTeam, kickoffAt }` (Task 6/`sync/analysis` bunu kullanır). `DisplayMatch`, `getUpcomingMatchesWithLeague`, `getMatchById` **değişmiyor**.

- [ ] **Step 1: `upsertMatches` ve `MatchUpsertRow`'u yeniden yaz**

```typescript
export interface MatchUpsertRow {
  league_id: string;
  odds_api_event_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
}

export interface UpsertedMatch {
  id: string;
  oddsApiEventId: string;
}

export async function upsertMatches(supabase: SupabaseClient, rows: MatchUpsertRow[]): Promise<UpsertedMatch[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from("matches")
    .upsert(rows, { onConflict: "odds_api_event_id" })
    .select("id, odds_api_event_id");
  if (error) throw new Error(`Maclar kaydedilemedi: ${error.message}`);

  interface RawRow {
    id: string;
    odds_api_event_id: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    oddsApiEventId: row.odds_api_event_id,
  }));
}
```

- [ ] **Step 2: `SyncMatch` ve `getUpcomingMatches`'i sadeleştir**

```typescript
export interface SyncMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
}

export async function getUpcomingMatches(
  supabase: SupabaseClient,
  withinDays: number,
  limit: number,
): Promise<SyncMatch[]> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("matches")
    .select("id, home_team, away_team, kickoff_at")
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", untilIso)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Yaklasan maclar alinamadi: ${error.message}`);

  interface RawMatchRow {
    id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
  }

  return ((data ?? []) as RawMatchRow[]).map((row) => ({
    id: row.id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
  }));
}
```

`DisplayMatch`, `getUpcomingMatchesWithLeague`, `getMatchById` fonksiyonlarına dokunma.

- [ ] **Step 3: `matches.test.ts`'i güncelle**

`describe("upsertMatches", ...)` ve `describe("getUpcomingMatches", ...)` bloklarını şununla değiştir (`getUpcomingMatchesWithLeague` ve `getMatchById` blokları aynen kalır):

```typescript
describe("upsertMatches", () => {
  it("does nothing when rows is empty", async () => {
    const upsert = vi.fn();
    const from = vi.fn(() => ({ upsert }));
    await upsertMatches({ from } as any, []);
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts rows with the odds api event id as the conflict key and returns ids", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: "m1", odds_api_event_id: "evt1" }],
      error: null,
    });
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    const rows = [
      {
        league_id: "l1",
        odds_api_event_id: "evt1",
        home_team: "A",
        away_team: "B",
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ];
    const result = await upsertMatches({ from } as any, rows);
    expect(from).toHaveBeenCalledWith("matches");
    expect(upsert).toHaveBeenCalledWith(rows, { onConflict: "odds_api_event_id" });
    expect(result).toEqual([{ id: "m1", oddsApiEventId: "evt1" }]);
  });

  it("throws when the upsert fails", async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    await expect(
      upsertMatches({ from } as any, [
        {
          league_id: "l1",
          odds_api_event_id: "evt1",
          home_team: "A",
          away_team: "B",
          kickoff_at: "2026-09-20T15:00:00Z",
        },
      ]),
    ).rejects.toThrow("boom");
  });
});

describe("getUpcomingMatches", () => {
  it("queries matches within the given window and maps rows to camelCase", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "m1",
          home_team: "A",
          away_team: "B",
          kickoff_at: "2026-09-20T15:00:00Z",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));

    const result = await getUpcomingMatches({ from } as any, 14, 200);

    expect(from).toHaveBeenCalledWith("matches");
    expect(limit).toHaveBeenCalledWith(200);
    expect(result).toEqual([
      {
        id: "m1",
        homeTeam: "A",
        awayTeam: "B",
        kickoffAt: "2026-09-20T15:00:00Z",
      },
    ]);
  });
});
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npm test -- matches`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/matches.ts src/lib/db/matches.test.ts
git commit -m "feat: matches tablosunu odds_api_event_id ile yeniden yaz"
```

---

### Task 5: `sync/odds`'u birleştir, `sync/matches`/`sync/stats`/`api-football.ts`/`team-stats.ts`'i sil

**Files:**
- Modify: `src/app/api/sync/odds/route.ts`
- Modify: `src/app/api/sync/odds/route.test.ts`
- Delete: `src/app/api/sync/matches/route.ts`
- Delete: `src/app/api/sync/matches/route.test.ts`
- Delete: `src/app/api/sync/stats/route.ts`
- Delete: `src/app/api/sync/stats/route.test.ts`
- Delete: `src/lib/api-football.ts`
- Delete: `src/lib/api-football.test.ts`
- Delete: `src/lib/db/team-stats.ts`
- Delete: `src/lib/db/team-stats.test.ts`

**Interfaces:**
- Consumes: Task 2'nin `SyncLeague { id, oddsApiSportKey }`, Task 3'ün `OddsQuote.eventId`, Task 4'ün `upsertMatches(...): UpsertedMatch[]`.
- Produces: `POST /api/sync/odds` artık `{ ok, totalMatchesUpserted, totalOddsInserted, failed }` döndürüyor (eski `totalUnmatched` alanı kalktı — artık isim eşleştirmesi yok).

- [ ] **Step 1: Eski dosyaları sil**

```bash
git rm src/app/api/sync/matches/route.ts src/app/api/sync/matches/route.test.ts
git rm src/app/api/sync/stats/route.ts src/app/api/sync/stats/route.test.ts
git rm src/lib/api-football.ts src/lib/api-football.test.ts
git rm src/lib/db/team-stats.ts src/lib/db/team-stats.test.ts
```

(Boş kalan `src/app/api/sync/matches/` ve `src/app/api/sync/stats/` dizinleri otomatik silinir.)

- [ ] **Step 2: `sync/odds/route.ts`'i yeniden yaz**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches, type MatchUpsertRow } from "@/lib/db/matches";
import { insertOddsSnapshots } from "@/lib/db/odds";
import { getOddsForSport } from "@/lib/odds-api";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const leagues = (await getActiveLeagues(supabase)).filter((l) => l.oddsApiSportKey);

  let totalMatchesUpserted = 0;
  let totalOddsInserted = 0;
  let failed = 0;

  for (const league of leagues) {
    try {
      const quotes = await getOddsForSport(league.oddsApiSportKey as string);
      if (quotes.length === 0) continue;

      const matchRowsByEventId = new Map<string, MatchUpsertRow>();
      for (const quote of quotes) {
        if (!matchRowsByEventId.has(quote.eventId)) {
          matchRowsByEventId.set(quote.eventId, {
            league_id: league.id,
            odds_api_event_id: quote.eventId,
            home_team: quote.homeTeam,
            away_team: quote.awayTeam,
            kickoff_at: quote.commenceTime,
          });
        }
      }

      const upserted = await upsertMatches(supabase, Array.from(matchRowsByEventId.values()));
      totalMatchesUpserted += upserted.length;

      const matchIdByEventId = new Map(upserted.map((m) => [m.oddsApiEventId, m.id]));
      const oddsRows = quotes
        .map((quote) => {
          const matchId = matchIdByEventId.get(quote.eventId);
          if (!matchId) return null;
          return {
            match_id: matchId,
            market: quote.market,
            outcome: quote.outcome,
            bookmaker: quote.bookmaker,
            price: quote.price,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      await insertOddsSnapshots(supabase, oddsRows);
      totalOddsInserted += oddsRows.length;
    } catch (err) {
      console.error(`Oran senkronizasyonu basarisiz: league=${league.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, totalMatchesUpserted, totalOddsInserted, failed });
}
```

- [ ] **Step 3: `sync/odds/route.test.ts`'i yeniden yaz**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/matches", () => ({ upsertMatches: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ insertOddsSnapshots: vi.fn() }));
vi.mock("@/lib/odds-api", () => ({ getOddsForSport: vi.fn() }));

import { POST } from "./route";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches } from "@/lib/db/matches";
import { insertOddsSnapshots } from "@/lib/db/odds";
import { getOddsForSport } from "@/lib/odds-api";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/odds", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getActiveLeagues).mockReset();
  vi.mocked(upsertMatches).mockReset();
  vi.mocked(insertOddsSnapshots).mockReset().mockResolvedValue(undefined);
  vi.mocked(getOddsForSport).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/odds", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("upserts the match from the odds event and inserts odds keyed by the returned match id", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", oddsApiSportKey: "soccer_epl" },
      { id: "l2", oddsApiSportKey: null },
    ]);
    vi.mocked(getOddsForSport).mockResolvedValue([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Manchester City",
        price: 1.8,
      },
    ]);
    vi.mocked(upsertMatches).mockResolvedValue([{ id: "m1", oddsApiEventId: "evt1" }]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getOddsForSport).toHaveBeenCalledTimes(1);
    expect(getOddsForSport).toHaveBeenCalledWith("soccer_epl");
    expect(upsertMatches).toHaveBeenCalledWith(expect.anything(), [
      {
        league_id: "l1",
        odds_api_event_id: "evt1",
        home_team: "Manchester City",
        away_team: "Arsenal",
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ]);
    expect(insertOddsSnapshots).toHaveBeenCalledWith(expect.anything(), [
      { match_id: "m1", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 4.2 },
      { match_id: "m1", market: "h2h", outcome: "Manchester City", bookmaker: "pinnacle", price: 1.8 },
    ]);
    expect(body).toEqual({ ok: true, totalMatchesUpserted: 1, totalOddsInserted: 2, failed: 0 });
  });

  it("skips a league when getOddsForSport returns no quotes", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([{ id: "l1", oddsApiSportKey: "soccer_epl" }]);
    vi.mocked(getOddsForSport).mockResolvedValue([]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(upsertMatches).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, totalMatchesUpserted: 0, totalOddsInserted: 0, failed: 0 });
  });

  it("continues to the next league and reports a failure count when upsertMatches throws for one league", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", oddsApiSportKey: "soccer_epl" },
      { id: "l2", oddsApiSportKey: "soccer_france_ligue_one" },
    ]);
    vi.mocked(getOddsForSport).mockResolvedValue([
      {
        eventId: "evt1",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
    ]);
    vi.mocked(upsertMatches)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce([{ id: "m1", oddsApiEventId: "evt1" }]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(upsertMatches).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ ok: true, totalMatchesUpserted: 1, totalOddsInserted: 1, failed: 1 });
  });
});
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npm test`
Expected: PASS (silinen dosyalara ait test yok, `sync/odds` testleri geçiyor)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sync/odds'u fikstur+oran icin birlestir, API-Football'u tamamen kaldir"
```

---

### Task 6: `sync/analysis` — takım istatistiği bağımlılığını kaldır

**Files:**
- Modify: `src/app/api/sync/analysis/route.ts`
- Modify: `src/app/api/sync/analysis/route.test.ts`

**Interfaces:**
- Consumes: Task 4'ün sadeleştirilmiş `SyncMatch { id, homeTeam, awayTeam, kickoffAt }`.
- Produces: değişmiyor — `generateMatchAnalysis` çağrısına her zaman `homeStats: null, awayStats: null` geçiyor (prompt zaten bunu "veri mevcut değil" olarak işliyor, bkz. `src/lib/analysis-prompt.ts`).

- [ ] **Step 1: `route.ts`'ten `team-stats` importunu ve kullanımını kaldır**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestOdds } from "@/lib/db/odds";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateMatchAnalysis, GEMINI_MODEL } from "@/lib/gemini";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

export const maxDuration = 60;

const ANALYSIS_SYNC_WINDOW_DAYS = 3;
const MAX_MATCHES_PER_RUN = 15;

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const matches = await getUpcomingMatches(supabase, ANALYSIS_SYNC_WINDOW_DAYS, MAX_MATCHES_PER_RUN);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of matches) {
    try {
      const [odds, latestAnalysisAt] = await Promise.all([
        getLatestOdds(supabase, match.id),
        getLatestAnalysisGeneratedAt(supabase, match.id),
      ]);

      const latestDataFetchedAt = odds[0]?.fetchedAt ?? null;

      if (!needsFreshAnalysis(latestAnalysisAt, latestDataFetchedAt)) {
        skipped += 1;
        continue;
      }

      const result = await generateMatchAnalysis({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: match.kickoffAt,
        homeStats: null,
        awayStats: null,
        odds: odds.map((o) => ({ bookmaker: o.bookmaker, outcome: o.outcome, price: o.price })),
      });

      if (!result) {
        failed += 1;
        continue;
      }

      await insertAiAnalysis(supabase, {
        match_id: match.id,
        team_analyst_text: result.teamAnalystText,
        betting_analyst_text: result.bettingAnalystText,
        commentator_text: result.commentatorText,
        summary_text: result.summaryText,
        model_used: GEMINI_MODEL,
      });

      generated += 1;
    } catch (err) {
      console.error(`Analiz senkronizasyonu basarisiz: match=${match.id} ->`, err);
      failed += 1;
      continue;
    }
  }

  return NextResponse.json({ ok: true, generated, skipped, failed });
}
```

- [ ] **Step 2: `route.test.ts`'i güncelle**

Dosyanın tamamını şununla değiştir:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ getLatestOdds: vi.fn() }));
vi.mock("@/lib/db/ai-analyses", () => ({
  getLatestAnalysisGeneratedAt: vi.fn(),
  needsFreshAnalysis: vi.fn(),
  insertAiAnalysis: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({ generateMatchAnalysis: vi.fn(), GEMINI_MODEL: "gemini-3.5-flash-lite" }));

import { POST } from "./route";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestOdds } from "@/lib/db/odds";
import { getLatestAnalysisGeneratedAt, needsFreshAnalysis, insertAiAnalysis } from "@/lib/db/ai-analyses";
import { generateMatchAnalysis } from "@/lib/gemini";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/analysis", { method: "POST", headers });
}

const match = {
  id: "m1",
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(getLatestOdds).mockReset().mockResolvedValue([]);
  vi.mocked(getLatestAnalysisGeneratedAt).mockReset().mockResolvedValue(null);
  vi.mocked(needsFreshAnalysis).mockReset().mockReturnValue(true);
  vi.mocked(insertAiAnalysis).mockReset().mockResolvedValue(undefined);
  vi.mocked(generateMatchAnalysis).mockReset().mockResolvedValue({
    teamAnalystText: "a",
    bettingAnalystText: "b",
    commentatorText: "c",
    summaryText: "d",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/analysis", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("generates and stores an analysis for a match that needs one", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getUpcomingMatches).toHaveBeenCalledWith(expect.anything(), 3, 15);
    expect(needsFreshAnalysis).toHaveBeenCalledWith(null, null);
    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ homeTeam: "Arsenal", awayTeam: "Chelsea", homeStats: null, awayStats: null }),
    );
    expect(insertAiAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        match_id: "m1",
        team_analyst_text: "a",
        betting_analyst_text: "b",
        commentator_text: "c",
        summary_text: "d",
        model_used: "gemini-3.5-flash-lite",
      }),
    );
    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 0 });
  });

  it("skips a match when needsFreshAnalysis returns false", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(needsFreshAnalysis).mockReturnValue(false);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(generateMatchAnalysis).not.toHaveBeenCalled();
    expect(insertAiAnalysis).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, generated: 0, skipped: 1, failed: 0 });
  });

  it("counts a failure and continues when generateMatchAnalysis returns null", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match, { ...match, id: "m2" }]);
    vi.mocked(generateMatchAnalysis).mockResolvedValueOnce(null).mockResolvedValueOnce({
      teamAnalystText: "a",
      bettingAnalystText: "b",
      commentatorText: "c",
      summaryText: "d",
    });

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(insertAiAnalysis).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("continues to the next match and counts a failure when a DB call throws", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match, { ...match, id: "m2" }]);
    vi.mocked(getLatestOdds).mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("passes missing odds through as empty so the prompt marks them as unavailable", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getLatestOdds).mockResolvedValue([]);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ homeStats: null, awayStats: null, odds: [] }),
    );
  });
});
```

- [ ] **Step 3: Testleri çalıştır**

Run: `npm test -- analysis`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sync/analysis/route.ts src/app/api/sync/analysis/route.test.ts
git commit -m "feat: sync/analysis'i team-stats bagimliligindan kurtar"
```

---

### Task 7: Gemini araştırma kütüphanesi + `match_research` DB katmanı

**Files:**
- Create: `src/lib/gemini-research.ts`
- Create: `src/lib/gemini-research.test.ts`
- Create: `src/lib/db/match-research.ts`
- Create: `src/lib/db/match-research.test.ts`

**Interfaces:**
- Consumes: `GEMINI_API_KEY` env değişkeni (mevcut `src/lib/gemini.ts` deseni), `@google/genai`'nin `ai.models.generateContent({ model, contents, config: { tools: [{ googleSearch: {} }] } })` şekli (canlı testle doğrulandı — bkz. spec §3), Task 1'in `match_research` tablosu.
- Produces: `researchMatchContext(input): Promise<MatchResearchResult | null>`, `insertMatchResearch`, `getMatchResearch` — Task 8'in server action'ı bunları kullanır.

- [ ] **Step 1: `src/lib/gemini-research.ts`'i yaz**

```typescript
import { GoogleGenAI } from "@google/genai";

export const RESEARCH_MODEL = "gemini-3.5-flash-lite";

export interface MatchResearchSource {
  url: string;
  title: string;
}

export interface MatchResearchResult {
  content: string;
  sources: MatchResearchSource[];
}

export interface ResearchMatchInput {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

function buildResearchPrompt(input: ResearchMatchInput): string {
  return [
    `${input.homeTeam} - ${input.awayTeam} macini arastir (${input.kickoffAt} tarihli).`,
    "Su bilgileri bul ve Turkce raporla:",
    "1) Her iki takimin bilinen sakat/cezali oyunculari",
    "2) Her iki takimin son 5 resmi mac sonucu (rakip, skor, tarih)",
    "3) Bu iki takimin birbirine karsi son karsilasmalarindan 1-2 ornek",
    "Emin olmadigin veya bulamadigin bilgiyi acikca 'bulunamadi' olarak belirt, uydurma.",
  ].join("\n");
}

export async function researchMatchContext(input: ResearchMatchInput): Promise<MatchResearchResult | null> {
  const apiKey = getApiKey();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: RESEARCH_MODEL,
      contents: buildResearchPrompt(input),
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) {
      console.warn("Gemini arastirma yaniti bos");
      return null;
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: MatchResearchSource[] = chunks
      .map((c) => ({ url: c.web?.uri ?? "", title: c.web?.title ?? "" }))
      .filter((s) => s.url);

    return { content: text, sources };
  } catch (err) {
    console.warn("Gemini arastirmasi basarisiz:", err);
    return null;
  }
}
```

- [ ] **Step 2: `src/lib/gemini-research.test.ts`'i yaz**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { researchMatchContext, RESEARCH_MODEL } from "./gemini-research";

const minimalInput = { homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-09-20T15:00:00Z" };

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockGenerateContent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("researchMatchContext", () => {
  it("calls the Gemini SDK with google search grounding and returns text + sources", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "arastirma sonucu",
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "https://example.com/a", title: "Ornek Kaynak" } }],
          },
        },
      ],
    });

    const result = await researchMatchContext(minimalInput);

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: RESEARCH_MODEL,
        config: { tools: [{ googleSearch: {} }] },
      }),
    );
    expect(result).toEqual({
      content: "arastirma sonucu",
      sources: [{ url: "https://example.com/a", title: "Ornek Kaynak" }],
    });
  });

  it("returns an empty sources array when there is no grounding metadata", async () => {
    mockGenerateContent.mockResolvedValue({ text: "sonuc", candidates: [{}] });
    const result = await researchMatchContext(minimalInput);
    expect(result).toEqual({ content: "sonuc", sources: [] });
  });

  it("returns null when the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "", candidates: [] });
    const result = await researchMatchContext(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the SDK call throws", async () => {
    mockGenerateContent.mockRejectedValue(new Error("rate limited"));
    const result = await researchMatchContext(minimalInput);
    expect(result).toBeNull();
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(researchMatchContext(minimalInput)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: `src/lib/db/match-research.ts`'i yaz**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchResearchSourceRow {
  url: string;
  title: string;
}

export interface MatchResearchInsertRow {
  match_id: string;
  content: string;
  sources: MatchResearchSourceRow[];
  model_used: string;
}

export async function insertMatchResearch(supabase: SupabaseClient, row: MatchResearchInsertRow): Promise<void> {
  const { error } = await supabase.from("match_research").insert(row);
  if (error) throw new Error(`Arastirma kaydedilemedi: ${error.message}`);
}

export interface MatchResearchRecord {
  content: string;
  sources: MatchResearchSourceRow[];
  modelUsed: string;
  generatedAt: string;
}

export async function getMatchResearch(supabase: SupabaseClient, matchId: string): Promise<MatchResearchRecord | null> {
  const { data, error } = await supabase
    .from("match_research")
    .select("content, sources, model_used, generated_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw new Error(`Arastirma alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as {
    content: string;
    sources: MatchResearchSourceRow[];
    model_used: string;
    generated_at: string;
  };
  return {
    content: row.content,
    sources: row.sources,
    modelUsed: row.model_used,
    generatedAt: row.generated_at,
  };
}
```

- [ ] **Step 4: `src/lib/db/match-research.test.ts`'i yaz**

```typescript
import { describe, it, expect, vi } from "vitest";
import { insertMatchResearch, getMatchResearch } from "./match-research";

describe("insertMatchResearch", () => {
  it("inserts a row into match_research", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = {
      match_id: "m1",
      content: "arastirma metni",
      sources: [{ url: "https://example.com", title: "Kaynak" }],
      model_used: "gemini-3.5-flash-lite",
    };
    await insertMatchResearch({ from } as any, row);
    expect(from).toHaveBeenCalledWith("match_research");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertMatchResearch({ from } as any, {
        match_id: "m1",
        content: "x",
        sources: [],
        model_used: "gemini-3.5-flash-lite",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("getMatchResearch", () => {
  it("returns the research record when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        content: "arastirma metni",
        sources: [{ url: "https://example.com", title: "Kaynak" }],
        model_used: "gemini-3.5-flash-lite",
        generated_at: "2026-09-14T10:00:00Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchResearch({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("match_research");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual({
      content: "arastirma metni",
      sources: [{ url: "https://example.com", title: "Kaynak" }],
      modelUsed: "gemini-3.5-flash-lite",
      generatedAt: "2026-09-14T10:00:00Z",
    });
  });

  it("returns null when not found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getMatchResearch({ from } as any, "missing");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchResearch({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test -- gemini-research match-research`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/gemini-research.ts src/lib/gemini-research.test.ts src/lib/db/match-research.ts src/lib/db/match-research.test.ts
git commit -m "feat: Gemini Google Search grounding ile mac arastirma kutuphanesi ekle"
```

---

### Task 8: "Araştır" butonu — Server Action + UI + maç detay sayfası

**Files:**
- Create: `src/app/matches/[id]/research-actions.ts`
- Create: `src/app/matches/[id]/research-button.tsx`
- Create: `src/app/matches/[id]/research-button.module.css`
- Modify: `src/app/matches/[id]/page.tsx`
- Modify: `src/app/matches/[id]/page.module.css`

**Interfaces:**
- Consumes: Task 7'nin `researchMatchContext`, `insertMatchResearch`, `getMatchResearch`; mevcut `getMatchById` (`src/lib/db/matches.ts`, değişmedi).
- Produces: maç detay sayfasında "Sakatlik / Form / H2H Arastirmasi" bölümü — araştırma yoksa buton, varsa kalıcı sonuç.

- [ ] **Step 1: `research-actions.ts`'i yaz**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById } from "@/lib/db/matches";
import { getMatchResearch, insertMatchResearch } from "@/lib/db/match-research";
import { researchMatchContext, RESEARCH_MODEL } from "@/lib/gemini-research";

export interface ResearchMatchState {
  error: string | null;
}

export async function researchMatch(matchId: string, _prevState: ResearchMatchState): Promise<ResearchMatchState> {
  const supabase = getSupabaseClient();

  const existing = await getMatchResearch(supabase, matchId);
  if (existing) {
    return { error: null };
  }

  const match = await getMatchById(supabase, matchId);
  if (!match) {
    return { error: "Mac bulunamadi." };
  }

  const result = await researchMatchContext({
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt,
  });

  if (!result) {
    return { error: "Arastirma basarisiz, tekrar deneyin." };
  }

  try {
    await insertMatchResearch(supabase, {
      match_id: matchId,
      content: result.content,
      sources: result.sources,
      model_used: RESEARCH_MODEL,
    });
  } catch {
    return { error: "Arastirma kaydedilemedi, tekrar deneyin." };
  }

  revalidatePath("/matches/[id]", "page");
  return { error: null };
}
```

- [ ] **Step 2: `research-button.tsx`'i yaz**

```typescript
"use client";

import { useActionState } from "react";
import { researchMatch, type ResearchMatchState } from "./research-actions";
import styles from "./research-button.module.css";

const initialState: ResearchMatchState = { error: null };

export function ResearchButton({ matchId }: { matchId: string }) {
  const action = researchMatch.bind(null, matchId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.form}>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={styles.button}>
        {pending ? "Arastiriliyor..." : "Arastir"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `research-button.module.css`'i yaz**

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.button {
  padding: 10px 16px;
  border-radius: 6px;
  border: none;
  background: var(--foreground);
  color: var(--background);
  font-weight: 600;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  color: #dc2626;
  font-size: 13px;
}
```

- [ ] **Step 4: `page.tsx`'i güncelle**

Dosyanın tamamını şununla değiştir (eski `team-stats` importu, `RecentMatchShape`, `renderTeamStats` ve "Takim Durumu" bölümü kaldırıldı; yerine `match_research` bölümü eklendi):

```typescript
import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById } from "@/lib/db/matches";
import { getLeagueById } from "@/lib/db/leagues";
import { getLatestOdds, getOddsHistory } from "@/lib/db/odds";
import { getLatestAnalysis } from "@/lib/db/ai-analyses";
import { getManualOddsForMatch } from "@/lib/db/manual-odds";
import { getMatchResearch } from "@/lib/db/match-research";
import { averagePricesByOutcome } from "@/lib/odds-chart";
import { compareManualToReference } from "@/lib/odds-comparison";
import { formatKickoffTime, formatRelativeUpdate } from "@/lib/format";
import { OddsChartView } from "./odds-chart-view";
import { ManualOddsForm } from "./manual-odds-form";
import { ResearchButton } from "./research-button";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = getSupabaseClient();
  const match = await getMatchById(supabase, id);
  if (!match) {
    notFound();
  }

  const [league, latestOdds, oddsHistory, analysis, manualOdds, research] = await Promise.all([
    getLeagueById(supabase, match.leagueId),
    getLatestOdds(supabase, match.id),
    getOddsHistory(supabase, match.id),
    getLatestAnalysis(supabase, match.id),
    getManualOddsForMatch(supabase, match.id),
    getMatchResearch(supabase, match.id),
  ]);

  const manualComparisons =
    manualOdds.length > 0
      ? compareManualToReference(
          manualOdds.map((m) => ({ outcome: m.outcome, price: m.price })),
          averagePricesByOutcome(latestOdds),
        )
      : [];

  return (
    <main className={styles.page}>
      <p className={styles.league}>{league ? `${league.name} (${league.country})` : ""}</p>
      <h1 className={styles.title}>
        {match.homeTeam} - {match.awayTeam}
      </h1>
      <p className={styles.kickoff}>{formatKickoffTime(match.kickoffAt)}</p>

      <section className={styles.section}>
        <h2>Sakatlik / Form / H2H Arastirmasi</h2>
        {research ? (
          <>
            <p className={styles.updatedAt}>{formatRelativeUpdate(research.generatedAt)}</p>
            <p className={styles.researchContent}>{research.content}</p>
            {research.sources.length > 0 && (
              <ul className={styles.sourcesList}>
                {research.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className={styles.noData}>
              Bu mac icin henuz arastirma yapilmadi. AI tarafindan web'de arastirilir, sonucu dogrulayin.
            </p>
            <ResearchButton matchId={match.id} />
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2>Guncel Referans Oran</h2>
        {latestOdds[0]?.fetchedAt && (
          <p className={styles.updatedAt}>{formatRelativeUpdate(latestOdds[0].fetchedAt)}</p>
        )}
        {latestOdds.length === 0 ? (
          <p className={styles.noData}>Oran verisi mevcut degil.</p>
        ) : (
          <ul className={styles.oddsList}>
            {latestOdds.map((o, i) => (
              <li key={`${o.bookmaker}-${o.outcome}-${i}`}>
                {o.outcome}: {o.price} ({o.bookmaker})
              </li>
            ))}
          </ul>
        )}
        <h3>Oran Gecmisi</h3>
        <p className={styles.noData}>
          Bu grafik gercek bahis hacmini degil, periyodik oran olcumlerimizi gosterir.
        </p>
        <OddsChartView history={oddsHistory} />
      </section>

      <section className={styles.section}>
        <h2>AI Analiz</h2>
        {analysis?.generatedAt && (
          <p className={styles.updatedAt}>{formatRelativeUpdate(analysis.generatedAt)}</p>
        )}
        {!analysis ? (
          <p className={styles.noData}>Bu mac icin analiz henuz uretilmedi.</p>
        ) : (
          <div className={styles.analysis}>
            <p className={styles.summary}>{analysis.summaryText}</p>
            <div>
              <h3>Takim Analizcisi</h3>
              <p>{analysis.teamAnalystText}</p>
            </div>
            <div>
              <h3>Bahis Analizcisi</h3>
              <p>{analysis.bettingAnalystText}</p>
            </div>
            <div>
              <h3>Yorumcu</h3>
              <p>{analysis.commentatorText}</p>
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2>Manuel Oran Karsilastirma</h2>
        {manualOdds.length === 0 ? (
          <p className={styles.noData}>Henuz manuel oran girilmedi.</p>
        ) : (
          <>
            <ul className={styles.oddsList}>
              {manualOdds.map((m) => (
                <li key={m.id}>
                  {m.enteredBy}: {m.outcome} @ {m.price}
                </li>
              ))}
            </ul>
            {manualComparisons.length === 0 ? (
              <p className={styles.noData}>
                Bu mac icin referans oran mevcut olmadigindan karsilastirma yapilamiyor.
              </p>
            ) : (
              <ul className={styles.oddsList}>
                {manualComparisons.map((c) => (
                  <li key={c.outcome}>
                    {c.outcome}: siz {c.manualPrice}, referans {c.referencePrice.toFixed(2)} (fark{" "}
                    {c.diffPercent > 0 ? "+" : ""}
                    {c.diffPercent.toFixed(1)}%)
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <ManualOddsForm matchId={match.id} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: `page.module.css`'i güncelle**

`.statsGrid`, `.teamStats`, `.recentMatches` sınıflarını kaldır (artık kullanılmıyor); yerine şunları ekle:

```css
.researchContent {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.5;
}

.sourcesList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  opacity: 0.8;
}
```

- [ ] **Step 6: Testleri çalıştır**

Run: `npm test`
Expected: PASS (bu task için yeni bir test dosyası yok — `page.tsx` bir Server Component, mevcut projede sayfa düzeyinde otomatik test yok; Task 9'da/final review'da manuel doğrulama yapılacak)

- [ ] **Step 7: Commit**

```bash
git add src/app/matches/\[id\]/research-actions.ts src/app/matches/\[id\]/research-button.tsx src/app/matches/\[id\]/research-button.module.css src/app/matches/\[id\]/page.tsx src/app/matches/\[id\]/page.module.css
git commit -m "feat: mac detayina Arastir butonu ve sakatlik/form arastirma bolumu ekle"
```

---

### Task 9: GitHub Actions ve `.env.local.example` temizliği

**Files:**
- Modify: `.github/workflows/sync.yml`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: Task 5'in `POST /api/sync/odds` (artık fikstür+oran birlikte), Task 6'nın değişmeyen `POST /api/sync/analysis`.
- Produces: yok (son task, sadece operasyonel temizlik).

- [ ] **Step 1: `sync.yml`'i sadeleştir**

```yaml
name: Veri Senkronizasyonu

on:
  schedule:
    - cron: "0 8 * * *"
    - cron: "0 9 * * *"
  workflow_dispatch: {}

jobs:
  sync-odds:
    if: github.event.schedule == '0 8 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger mac + oran senkronizasyonu
        run: |
          curl -sf -X POST "${{ secrets.APP_BASE_URL }}/api/sync/odds" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"

  sync-analysis:
    if: github.event.schedule == '0 9 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger AI analiz senkronizasyonu
        run: |
          curl -sf -X POST "${{ secrets.APP_BASE_URL }}/api/sync/analysis" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

- [ ] **Step 2: `.env.local.example`'dan `API_FOOTBALL_KEY`'i kaldır**

```
# Supabase (Settings -> API)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Veri kaynaklari
ODDS_API_KEY=
GEMINI_API_KEY=

# GitHub Actions'in senkron route'larini tetiklerken kullandigi paylasilan sir
# (kendiniz uretin, orn: openssl rand -hex 32) - Vercel'e ve GitHub repo secret'ina
# ayni degeri eklemeniz gerekir
CRON_SECRET=
```

- [ ] **Step 3: Tüm test paketini son kez çalıştır**

Run: `npm test`
Expected: PASS (tüm dosyalar)

Run: `npm run build`
Expected: Başarılı (tip hataları yok — `LayoutProps` ile ilgili bilinen, Plan 1'den kalma zararsız hata dışında)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync.yml .env.local.example
git commit -m "chore: cron workflow'u ve env ornegini API-Football sonrasina gore guncelle"
```
