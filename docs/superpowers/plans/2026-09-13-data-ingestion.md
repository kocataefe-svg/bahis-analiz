# Veri Çekme (Data Ingestion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API-Football ve The Odds API'den lig/maç/takım istatistiği/oran verisini çekip Supabase'e yazan, ücretsiz kotalar içinde kalan, GitHub Actions ile zamanlanan bir veri çekme katmanı kurmak.

**Architecture:** İki ince API client kütüphanesi (API-Football, The Odds API) + üç korumalı Next.js API route'u (`/api/sync/matches`, `/api/sync/stats`, `/api/sync/odds`) + bu route'ları HTTP ile tetikleyen bir GitHub Actions scheduled workflow'u. Her route, paylaşılan bir `CRON_SECRET` ile korunur (Authorization header). DB erişimi `src/lib/db/*` altında küçük, test edilebilir yardımcı fonksiyonlara ayrılmıştır — route'lar sadece bu yardımcıları ve API client'larını birleştiren ince orkestratörlerdir.

**Tech Stack:** Next.js API routes, `@supabase/supabase-js` (Plan 1'den), `fetch` (yerleşik, ek HTTP kütüphanesi yok), `tsx` + `dotenv` (tek seferlik seed script'i çalıştırmak için), GitHub Actions (zamanlama).

**Spec:** [docs/superpowers/specs/2026-09-08-bahis-analiz-app-design.md](../specs/2026-09-08-bahis-analiz-app-design.md)

## Global Constraints

- **API-Football kotası (100 istek/gün) aşılmamalı.** Bu plandaki çağrı bütçesi: fikstür senkronu günde 2 kez × ~15 lig ≈ 30 istek; istatistik/sakatlık senkronu günde 1 kez × en fazla 15 maç × 3 istek (2× son maçlar + 1× sakatlık) ≈ 45 istek. Toplam ≈75/gün, seed script'i (tek seferlik, ~15 istek) ve yeniden denemeler için ~25 istek tampon payı bırakır.
- **The Odds API kotası (500 istek/ay) aşılmamalı.** Oran senkronu günde 1 kez × ~13 lig (oran kapsamı olan ligler) ≈ 13 istek/gün × 30 gün ≈ 390/ay, ~110 istek tampon payı bırakır.
- Hiçbir ücretli servis eklenmez (spec §9).
- Tüm senkronizasyon route'ları `CRON_SECRET` ile korunmalı — bu route'lar herkese açık olursa kotalar başkaları tarafından tüketilebilir. Bu, spec §8'deki "uygulamada auth yok" kararıyla çelişmez: o karar kullanıcı arayüzü için, bu ise arka plan altyapısı için.
- Veritabanı tablo/kolon adları spec §6'daki isimlerle birebir eşleşmeli. Bu plan spec §6'ya iki yeni kolon ekliyor (`leagues.current_season`, `matches.home_team_api_id`, `matches.away_team_api_id`) — spec zaten bunlarla güncellendi.
- Dış API çağrısı başarısız olursa (kota, ağ hatası, 5xx): o öğe atlanır, konsola loglanır, senkron akışının geri kalanı devam eder — hiçbir route tek bir başarısız çağrı yüzünden çökmemeli (spec §7).
- **Bilinçli kapsam sınırlaması:** `team_stats_snapshots.cards` bu planda doldurulmuyor (varsayılan `[]` kalıyor) ve `stats` alanı da doldurulmuyor (varsayılan `{}` kalıyor) — API-Football'un maç bazlı şut/top hakimiyeti istatistiği yalnızca oynanmış maçlar için mevcut, henüz oynanmamış maçlar için anlamlı veri dönmüyor; kart cezası verisi ayrı ve karmaşık bir endpoint akışı gerektiriyor. `form` ve `last_matches` alanları takımın son N maçının sonucundan (W/D/L) türetiliyor, bu yeterli bir başlangıç.

## Prerequisites (Manuel — Kullanıcı Tarafından Yapılmalı)

1. **API-Football hesabı + ücretsiz API key** — [api-football.com](https://www.api-football.com/) (veya RapidAPI üzerinden değil, doğrudan `api-sports.io` hesabı — bu plan doğrudan `v3.football.api-sports.io` host'unu ve `x-apisports-key` header'ını kullanıyor).
2. **The Odds API hesabı + ücretsiz API key** — [the-odds-api.com](https://the-odds-api.com/).
3. `.env.local`'e ekleyin: `API_FOOTBALL_KEY=...`, `ODDS_API_KEY=...`, ve yeni: `CRON_SECRET=<rastgele-uzun-bir-deger>` (örn. `openssl rand -hex 32`).
4. Vercel Project Settings → Environment Variables'a aynı üç değeri ekleyin (deploy edilen uygulamanın da bunlara ihtiyacı var).
5. Plan 1'in Task 2 Step 6'sı (migration'ı Supabase'e uygulama) henüz yapılmadıysa, önce onu yapın — bu plan üzerine ek bir migration (`0002`) ekliyor, `0001` uygulanmamışsa `0002` de uygulanamaz.

---

### Task 1: API-Football Client

**Files:**
- Create: `src/lib/api-football.ts`
- Test: `src/lib/api-football.test.ts`

**Interfaces:**
- Consumes: `API_FOOTBALL_KEY` env variable
- Produces:
  - `searchLeague(name: string, country: string): Promise<{ apiFootballId: number; currentSeason: number } | null>`
  - `getUpcomingFixtures(leagueId: number, season: number, fromDate: string, toDate: string): Promise<ApiFootballFixture[]>` — her öğe `{ apiFixtureId, kickoffAt, homeTeam, awayTeam, homeTeamApiId, awayTeamApiId }`
  - `getRecentFixtures(teamId: number, count: number): Promise<RecentFixtureResult[]>` — her öğe `{ apiFixtureId, date, opponent, goalsFor, goalsAgainst, result: "W"|"D"|"L" }`
  - `getInjuriesForFixture(fixtureId: number): Promise<unknown[]>` — ham API yanıtı, alan adları AI aşamasında yorumlanacak
  - Task 4, 5, 6 bu fonksiyonları doğrudan içe aktaracak.

- [ ] **Step 1: Başarısız testleri yaz**

`src/lib/api-football.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchLeague, getUpcomingFixtures, getRecentFixtures, getInjuriesForFixture } from "./api-football";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("API_FOOTBALL_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchLeague", () => {
  it("returns the league id and current season when found", async () => {
    mockFetchOnce({
      response: [
        {
          league: { id: 39, name: "Premier League" },
          seasons: [
            { year: 2025, current: false },
            { year: 2026, current: true },
          ],
        },
      ],
    });
    const result = await searchLeague("Premier League", "England");
    expect(result).toEqual({ apiFootballId: 39, currentSeason: 2026 });
  });

  it("returns null when no league is found", async () => {
    mockFetchOnce({ response: [] });
    const result = await searchLeague("Nonexistent League", "Nowhere");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await searchLeague("Premier League", "England");
    expect(result).toBeNull();
  });
});

describe("getUpcomingFixtures", () => {
  it("parses fixture list into the expected shape", async () => {
    mockFetchOnce({
      response: [
        {
          fixture: { id: 1001, date: "2026-09-20T15:00:00+00:00" },
          teams: {
            home: { id: 50, name: "Manchester City" },
            away: { id: 42, name: "Arsenal" },
          },
        },
      ],
    });
    const result = await getUpcomingFixtures(39, 2026, "2026-09-15", "2026-09-25");
    expect(result).toEqual([
      {
        apiFixtureId: 1001,
        kickoffAt: "2026-09-20T15:00:00+00:00",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
      },
    ]);
  });

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await getUpcomingFixtures(39, 2026, "2026-09-15", "2026-09-25");
    expect(result).toEqual([]);
  });
});

describe("getRecentFixtures", () => {
  it("computes W/D/L relative to the given team, including when they played away", async () => {
    mockFetchOnce({
      response: [
        {
          fixture: { id: 900, date: "2026-09-01T15:00:00+00:00" },
          teams: { home: { id: 50, name: "Manchester City" }, away: { id: 42, name: "Arsenal" } },
          goals: { home: 2, away: 1 },
        },
        {
          fixture: { id: 901, date: "2026-08-25T15:00:00+00:00" },
          teams: { home: { id: 42, name: "Arsenal" }, away: { id: 50, name: "Manchester City" } },
          goals: { home: 1, away: 1 },
        },
      ],
    });
    const result = await getRecentFixtures(50, 2);
    expect(result).toEqual([
      {
        apiFixtureId: 900,
        date: "2026-09-01T15:00:00+00:00",
        opponent: "Arsenal",
        goalsFor: 2,
        goalsAgainst: 1,
        result: "W",
      },
      {
        apiFixtureId: 901,
        date: "2026-08-25T15:00:00+00:00",
        opponent: "Arsenal",
        goalsFor: 1,
        goalsAgainst: 1,
        result: "D",
      },
    ]);
  });
});

describe("getInjuriesForFixture", () => {
  it("returns the raw injuries array", async () => {
    mockFetchOnce({ response: [{ player: { name: "Someone" }, type: "Injury" }] });
    const result = await getInjuriesForFixture(1001);
    expect(result).toEqual([{ player: { name: "Someone" }, type: "Injury" }]);
  });

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await getInjuriesForFixture(1001);
    expect(result).toEqual([]);
  });
});

describe("missing API key", () => {
  it("throws when API_FOOTBALL_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(searchLeague("Premier League", "England")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Testleri çalıştırıp başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/api-football.test.ts`
Expected: FAIL — `Cannot find module './api-football'`.

- [ ] **Step 3: `src/lib/api-football.ts` implementasyonunu yaz**

```ts
const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

export interface LeagueSearchResult {
  apiFootballId: number;
  currentSeason: number;
}

export interface ApiFootballFixture {
  apiFixtureId: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamApiId: number;
  awayTeamApiId: number;
}

export interface RecentFixtureResult {
  apiFixtureId: number;
  date: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
}

function getApiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("API_FOOTBALL_KEY env degiskeni tanimli degil");
  }
  return key;
}

async function apiFootballFetch(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${API_FOOTBALL_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": getApiKey() },
  });
  if (!res.ok) {
    console.warn(`API-Football istegi basarisiz: ${path} -> ${res.status}`);
    return null;
  }
  return res.json();
}

export async function searchLeague(name: string, country: string): Promise<LeagueSearchResult | null> {
  const data = await apiFootballFetch("/leagues", { name, country });
  const first = data?.response?.[0];
  if (!first) return null;
  const currentSeason = first.seasons?.find((s: any) => s.current)?.year;
  if (!first.league?.id || !currentSeason) return null;
  return { apiFootballId: first.league.id, currentSeason };
}

export async function getUpcomingFixtures(
  leagueId: number,
  season: number,
  fromDate: string,
  toDate: string,
): Promise<ApiFootballFixture[]> {
  const data = await apiFootballFetch("/fixtures", {
    league: String(leagueId),
    season: String(season),
    from: fromDate,
    to: toDate,
  });
  const list = data?.response ?? [];
  return list
    .filter((item: any) => item?.fixture?.id && item?.teams?.home?.name && item?.teams?.away?.name)
    .map((item: any) => ({
      apiFixtureId: item.fixture.id,
      kickoffAt: item.fixture.date,
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
      homeTeamApiId: item.teams.home.id,
      awayTeamApiId: item.teams.away.id,
    }));
}

export async function getRecentFixtures(teamId: number, count: number): Promise<RecentFixtureResult[]> {
  const data = await apiFootballFetch("/fixtures", {
    team: String(teamId),
    last: String(count),
  });
  const list = data?.response ?? [];
  return list
    .filter((item: any) => item?.fixture?.id && item?.goals?.home != null && item?.goals?.away != null)
    .map((item: any) => {
      const isHome = item.teams.home.id === teamId;
      const goalsFor = isHome ? item.goals.home : item.goals.away;
      const goalsAgainst = isHome ? item.goals.away : item.goals.home;
      const opponent = isHome ? item.teams.away.name : item.teams.home.name;
      let result: "W" | "D" | "L" = "D";
      if (goalsFor > goalsAgainst) result = "W";
      else if (goalsFor < goalsAgainst) result = "L";
      return {
        apiFixtureId: item.fixture.id,
        date: item.fixture.date,
        opponent,
        goalsFor,
        goalsAgainst,
        result,
      };
    });
}

export async function getInjuriesForFixture(fixtureId: number): Promise<unknown[]> {
  const data = await apiFootballFetch("/injuries", { fixture: String(fixtureId) });
  return data?.response ?? [];
}
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Run: `npx vitest run src/lib/api-football.test.ts`
Expected: PASS — 9/9 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-football.ts src/lib/api-football.test.ts
git commit -m "feat: api-football client"
```

---

### Task 2: The Odds API Client

**Files:**
- Create: `src/lib/odds-api.ts`
- Test: `src/lib/odds-api.test.ts`

**Interfaces:**
- Consumes: `ODDS_API_KEY` env variable
- Produces: `getOddsForSport(sportKey: string): Promise<OddsQuote[]>` — her öğe `{ homeTeam, awayTeam, commenceTime, bookmaker, market, outcome, price }`. Task 6 bunu kullanacak.

- [ ] **Step 1: Başarısız testleri yaz**

`src/lib/odds-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getOddsForSport } from "./odds-api";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => body }));
}

beforeEach(() => {
  vi.stubEnv("ODDS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getOddsForSport", () => {
  it("flattens events/bookmakers/markets/outcomes into a flat quote list", async () => {
    mockFetchOnce([
      {
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
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Manchester City",
        price: 1.8,
      },
      {
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
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

  it("returns an empty array when the request fails", async () => {
    mockFetchOnce({}, false, 500);
    const result = await getOddsForSport("soccer_epl");
    expect(result).toEqual([]);
  });

  it("throws when ODDS_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(getOddsForSport("soccer_epl")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/odds-api.test.ts`
Expected: FAIL — `Cannot find module './odds-api'`.

- [ ] **Step 3: `src/lib/odds-api.ts` implementasyonunu yaz**

```ts
const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";

export interface OddsQuote {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  market: string;
  outcome: string;
  price: number;
}

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error("ODDS_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

export async function getOddsForSport(sportKey: string): Promise<OddsQuote[]> {
  const url = new URL(`${ODDS_API_BASE_URL}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("regions", "eu");
  url.searchParams.set("markets", "h2h,btts");
  url.searchParams.set("oddsFormat", "decimal");

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn(`The Odds API istegi basarisiz: ${sportKey} -> ${res.status}`);
    return [];
  }

  const data = await res.json();
  const quotes: OddsQuote[] = [];
  for (const event of data ?? []) {
    for (const bookmaker of event.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        for (const outcome of market.outcomes ?? []) {
          quotes.push({
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            commenceTime: event.commence_time,
            bookmaker: bookmaker.key,
            market: market.key,
            outcome: outcome.name,
            price: outcome.price,
          });
        }
      }
    }
  }
  return quotes;
}
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Run: `npx vitest run src/lib/odds-api.test.ts`
Expected: PASS — 3/3 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/odds-api.ts src/lib/odds-api.test.ts
git commit -m "feat: the odds api client"
```

---

### Task 3: Şema Eklentisi + Lig Kataloğu + Seed Script

**Files:**
- Create: `supabase/migrations/0002_data_ingestion.sql`
- Create: `src/lib/league-catalog.ts`
- Create: `scripts/seed-leagues.ts`
- Modify: `package.json` (yeni devDependencies + script)

**Interfaces:**
- Consumes: `searchLeague` (Task 1), `getSupabaseClient` (Plan 1)
- Produces: `LEAGUE_CATALOG` sabiti (Task 4/5/6'nın dolaylı olarak dayandığı `leagues` tablosunu doldurur); `leagues.current_season`, `matches.home_team_api_id`, `matches.away_team_api_id` kolonları.

- [ ] **Step 1: Migration dosyasını oluştur**

`supabase/migrations/0002_data_ingestion.sql`:

```sql
begin;

alter table leagues add column if not exists current_season integer;
alter table matches add column if not exists home_team_api_id integer;
alter table matches add column if not exists away_team_api_id integer;

commit;
```

- [ ] **Step 2: Lig kataloğunu oluştur**

`src/lib/league-catalog.ts`:

```ts
export interface LeagueCatalogEntry {
  name: string;
  country: string;
  apiFootballSearchName: string;
  apiFootballSearchCountry: string;
  oddsApiSportKey: string | null;
}

export const LEAGUE_CATALOG: LeagueCatalogEntry[] = [
  { name: "Premier League", country: "İngiltere", apiFootballSearchName: "Premier League", apiFootballSearchCountry: "England", oddsApiSportKey: "soccer_epl" },
  { name: "Championship", country: "İngiltere", apiFootballSearchName: "Championship", apiFootballSearchCountry: "England", oddsApiSportKey: "soccer_efl_champ" },
  { name: "La Liga", country: "İspanya", apiFootballSearchName: "La Liga", apiFootballSearchCountry: "Spain", oddsApiSportKey: "soccer_spain_la_liga" },
  { name: "Serie A", country: "İtalya", apiFootballSearchName: "Serie A", apiFootballSearchCountry: "Italy", oddsApiSportKey: "soccer_italy_serie_a" },
  { name: "Bundesliga", country: "Almanya", apiFootballSearchName: "Bundesliga", apiFootballSearchCountry: "Germany", oddsApiSportKey: "soccer_germany_bundesliga" },
  { name: "Ligue 1", country: "Fransa", apiFootballSearchName: "Ligue 1", apiFootballSearchCountry: "France", oddsApiSportKey: "soccer_france_ligue_one" },
  { name: "Süper Lig", country: "Türkiye", apiFootballSearchName: "Super Lig", apiFootballSearchCountry: "Turkey", oddsApiSportKey: "soccer_turkey_super_league" },
  { name: "TFF 1. Lig", country: "Türkiye", apiFootballSearchName: "1. Lig", apiFootballSearchCountry: "Turkey", oddsApiSportKey: null },
  { name: "Eliteserien", country: "Norveç", apiFootballSearchName: "Eliteserien", apiFootballSearchCountry: "Norway", oddsApiSportKey: "soccer_norway_eliteserien" },
  { name: "Allsvenskan", country: "İsveç", apiFootballSearchName: "Allsvenskan", apiFootballSearchCountry: "Sweden", oddsApiSportKey: "soccer_sweden_allsvenskan" },
  { name: "Super League", country: "İsviçre", apiFootballSearchName: "Super League", apiFootballSearchCountry: "Switzerland", oddsApiSportKey: "soccer_switzerland_superleague" },
  { name: "Eredivisie", country: "Hollanda", apiFootballSearchName: "Eredivisie", apiFootballSearchCountry: "Netherlands", oddsApiSportKey: "soccer_netherlands_eredivisie" },
  { name: "Şampiyonlar Ligi", country: "Avrupa", apiFootballSearchName: "UEFA Champions League", apiFootballSearchCountry: "World", oddsApiSportKey: "soccer_uefa_champs_league" },
  { name: "Avrupa Ligi", country: "Avrupa", apiFootballSearchName: "UEFA Europa League", apiFootballSearchCountry: "World", oddsApiSportKey: "soccer_uefa_europa_league" },
  { name: "Milli Maçlar (Dünya Kupası Elemeleri - Avrupa)", country: "Avrupa", apiFootballSearchName: "World Cup - Qualification Europe", apiFootballSearchCountry: "World", oddsApiSportKey: "soccer_fifa_world_cup_qualifiers_europe" },
];
```

- [ ] **Step 3: Seed script bağımlılıklarını ekle**

```bash
npm install -D tsx dotenv
```

`package.json` `scripts` bölümüne ekle:

```json
"seed:leagues": "tsx scripts/seed-leagues.ts"
```

- [ ] **Step 4: Seed script'ini yaz**

`scripts/seed-leagues.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseClient } from "../src/lib/supabase";
import { searchLeague } from "../src/lib/api-football";
import { LEAGUE_CATALOG } from "../src/lib/league-catalog";

async function main() {
  const supabase = getSupabaseClient();

  for (const entry of LEAGUE_CATALOG) {
    const found = await searchLeague(entry.apiFootballSearchName, entry.apiFootballSearchCountry);

    if (!found) {
      console.warn(
        `COZULEMEDI: "${entry.name}" (${entry.apiFootballSearchName} / ${entry.apiFootballSearchCountry}) - API-Football'da bulunamadi, atlaniyor.`,
      );
      continue;
    }

    const { error } = await supabase.from("leagues").upsert(
      {
        name: entry.name,
        country: entry.country,
        api_football_id: found.apiFootballId,
        odds_api_sport_key: entry.oddsApiSportKey,
        current_season: found.currentSeason,
        active: true,
      },
      { onConflict: "api_football_id" },
    );

    if (error) {
      console.error(`HATA: "${entry.name}" kaydedilemedi:`, error.message);
    } else {
      console.log(`OK: "${entry.name}" -> api_football_id=${found.apiFootballId}, sezon=${found.currentSeason}`);
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

- [ ] **Step 5: Migration'ı Supabase'e uygula (manuel)**

Supabase Dashboard → SQL Editor → `supabase/migrations/0002_data_ingestion.sql` içeriğini yapıştırıp çalıştırın (Plan 1'in `0001` migration'ı zaten uygulanmış olmalı).

- [ ] **Step 6: Seed script'ini gerçek hesaplara karşı çalıştır (manuel doğrulama)**

`.env.local`'de `API_FOOTBALL_KEY` ve Supabase değerleri gerçek olmalı.

Run: `npm run seed:leagues`
Expected: Her lig için `OK: ...` satırı (bazı küçük ligler veya "Milli Maçlar" arama adı tam eşleşmezse `COZULEMEDI` uyarısı görülebilir — bu durumda `src/lib/league-catalog.ts`'deki `apiFootballSearchName`/`apiFootballSearchCountry` değerini API-Football Dashboard'dan doğru isimle güncelleyip tekrar çalıştırın). Supabase Dashboard → Table Editor → `leagues` tablosunda satırların göründüğünü doğrulayın.

**Not:** Bu adım TDD ile test edilmiyor — gerçek dış API'lere ve gerçek veritabanına yazan tek seferlik operasyonel bir script. Doğrulaması gerçek çalıştırma ile yapılır, birim testi ile değil.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0002_data_ingestion.sql src/lib/league-catalog.ts scripts/seed-leagues.ts package.json package-lock.json
git commit -m "feat: lig kataloğu, sema eklentisi ve seed script"
```

---

### Task 4: Maç (Fikstür) Senkronizasyonu

**Files:**
- Create: `src/lib/sync-auth.ts`
- Test: `src/lib/sync-auth.test.ts`
- Create: `src/lib/db/leagues.ts`
- Test: `src/lib/db/leagues.test.ts`
- Create: `src/lib/db/matches.ts`
- Test: `src/lib/db/matches.test.ts`
- Create: `src/app/api/sync/matches/route.ts`
- Test: `src/app/api/sync/matches/route.test.ts`
- Modify: `vitest.config.ts` (`@` path alias ekle)

**Interfaces:**
- Consumes: `getUpcomingFixtures` (Task 1), `getSupabaseClient` (Plan 1)
- Produces:
  - `isSyncRequestAuthorized(request: Request): boolean` — Task 5, 6 aynı fonksiyonu kullanacak.
  - `getActiveLeagues(supabase): Promise<SyncLeague[]>` — her öğe `{ id, apiFootballId, currentSeason, oddsApiSportKey }` — Task 5, 6 aynı fonksiyonu kullanacak.
  - `upsertMatches(supabase, rows: MatchUpsertRow[]): Promise<void>`
  - `getUpcomingMatches(supabase, withinDays: number, limit: number): Promise<SyncMatch[]>` — her öğe `{ id, apiFixtureId, homeTeam, awayTeam, homeTeamApiId, awayTeamApiId, kickoffAt }` — Task 5, 6 aynı fonksiyonu kullanacak.
  - `POST /api/sync/matches` — `Authorization: Bearer <CRON_SECRET>` ister.

- [ ] **Step 1: `vitest.config.ts`'e `@` path alias ekle**

Mevcut `vitest.config.ts`'i şu şekilde güncelle (sadece `resolve.alias` bloğuna `"@"` satırı eklenir, geri kalanı aynı kalır):

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
  },
});
```

- [ ] **Step 2: `sync-auth` için başarısız testi yaz**

`src/lib/sync-auth.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { isSyncRequestAuthorized } from "./sync-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/matches", { headers });
}

describe("isSyncRequestAuthorized", () => {
  it("returns false when CRON_SECRET is not set", () => {
    const req = makeRequest("Bearer anything");
    expect(isSyncRequestAuthorized(req)).toBe(false);
  });

  it("returns true when the Authorization header matches the secret", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest("Bearer my-secret");
    expect(isSyncRequestAuthorized(req)).toBe(true);
  });

  it("returns false when the Authorization header does not match", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest("Bearer wrong-secret");
    expect(isSyncRequestAuthorized(req)).toBe(false);
  });

  it("returns false when there is no Authorization header", () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    const req = makeRequest();
    expect(isSyncRequestAuthorized(req)).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/sync-auth.test.ts` — Expected: FAIL (`Cannot find module './sync-auth'`).

- [ ] **Step 3: `src/lib/sync-auth.ts` implementasyonunu yaz**

```ts
export function isSyncRequestAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}
```

Run: `npx vitest run src/lib/sync-auth.test.ts` — Expected: PASS, 4/4.

- [ ] **Step 4: `db/leagues` için başarısız testi yaz**

`src/lib/db/leagues.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getActiveLeagues } from "./leagues";

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq } as any;
}

describe("getActiveLeagues", () => {
  it("maps rows to camelCase and filters by active=true", async () => {
    const supabase = createSupabaseMock({
      data: [
        { id: "l1", api_football_id: 39, current_season: 2026, odds_api_sport_key: "soccer_epl" },
        { id: "l2", api_football_id: 204, current_season: null, odds_api_sport_key: null },
      ],
      error: null,
    });

    const result = await getActiveLeagues(supabase);

    expect(supabase.from).toHaveBeenCalledWith("leagues");
    expect(supabase.eq).toHaveBeenCalledWith("active", true);
    expect(result).toEqual([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 204, currentSeason: null, oddsApiSportKey: null },
    ]);
  });

  it("throws when the query fails", async () => {
    const supabase = createSupabaseMock({ data: null, error: { message: "boom" } });
    await expect(getActiveLeagues(supabase)).rejects.toThrow("boom");
  });
});
```

Run: `npx vitest run src/lib/db/leagues.test.ts` — Expected: FAIL (`Cannot find module './leagues'`).

- [ ] **Step 5: `src/lib/db/leagues.ts` implementasyonunu yaz**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncLeague {
  id: string;
  apiFootballId: number;
  currentSeason: number | null;
  oddsApiSportKey: string | null;
}

export async function getActiveLeagues(supabase: SupabaseClient): Promise<SyncLeague[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, api_football_id, current_season, odds_api_sport_key")
    .eq("active", true);

  if (error) throw new Error(`Ligler alinamadi: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    apiFootballId: row.api_football_id,
    currentSeason: row.current_season,
    oddsApiSportKey: row.odds_api_sport_key,
  }));
}
```

Run: `npx vitest run src/lib/db/leagues.test.ts` — Expected: PASS, 2/2.

- [ ] **Step 6: `db/matches` için başarısız testleri yaz**

`src/lib/db/matches.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { upsertMatches, getUpcomingMatches } from "./matches";

describe("upsertMatches", () => {
  it("does nothing when rows is empty", async () => {
    const upsert = vi.fn();
    const from = vi.fn(() => ({ upsert }));
    await upsertMatches({ from } as any, []);
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts rows with the fixture id as the conflict key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    const rows = [
      {
        league_id: "l1",
        api_football_fixture_id: 1001,
        home_team: "A",
        away_team: "B",
        home_team_api_id: 1,
        away_team_api_id: 2,
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ];
    await upsertMatches({ from } as any, rows);
    expect(from).toHaveBeenCalledWith("matches");
    expect(upsert).toHaveBeenCalledWith(rows, { onConflict: "api_football_fixture_id" });
  });

  it("throws when the upsert fails", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ upsert }));
    await expect(
      upsertMatches({ from } as any, [
        {
          league_id: "l1",
          api_football_fixture_id: 1001,
          home_team: "A",
          away_team: "B",
          home_team_api_id: 1,
          away_team_api_id: 2,
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
          api_football_fixture_id: 1001,
          home_team: "A",
          away_team: "B",
          home_team_api_id: 1,
          away_team_api_id: 2,
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
        apiFixtureId: 1001,
        homeTeam: "A",
        awayTeam: "B",
        homeTeamApiId: 1,
        awayTeamApiId: 2,
        kickoffAt: "2026-09-20T15:00:00Z",
      },
    ]);
  });
});
```

Run: `npx vitest run src/lib/db/matches.test.ts` — Expected: FAIL (`Cannot find module './matches'`).

- [ ] **Step 7: `src/lib/db/matches.ts` implementasyonunu yaz**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchUpsertRow {
  league_id: string;
  api_football_fixture_id: number;
  home_team: string;
  away_team: string;
  home_team_api_id: number;
  away_team_api_id: number;
  kickoff_at: string;
}

export async function upsertMatches(supabase: SupabaseClient, rows: MatchUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("matches").upsert(rows, { onConflict: "api_football_fixture_id" });
  if (error) throw new Error(`Maclar kaydedilemedi: ${error.message}`);
}

export interface SyncMatch {
  id: string;
  apiFixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamApiId: number;
  awayTeamApiId: number;
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
    .select("id, api_football_fixture_id, home_team, away_team, home_team_api_id, away_team_api_id, kickoff_at")
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", untilIso)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Yaklasan maclar alinamadi: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    apiFixtureId: row.api_football_fixture_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeTeamApiId: row.home_team_api_id,
    awayTeamApiId: row.away_team_api_id,
    kickoffAt: row.kickoff_at,
  }));
}
```

Run: `npx vitest run src/lib/db/matches.test.ts` — Expected: PASS, 4/4.

- [ ] **Step 8: Route için başarısız testi yaz**

`src/app/api/sync/matches/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/matches", () => ({ upsertMatches: vi.fn() }));
vi.mock("@/lib/api-football", () => ({ getUpcomingFixtures: vi.fn() }));

import { POST } from "./route";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches } from "@/lib/db/matches";
import { getUpcomingFixtures } from "@/lib/api-football";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/matches", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getActiveLeagues).mockReset();
  vi.mocked(upsertMatches).mockReset().mockResolvedValue(undefined);
  vi.mocked(getUpcomingFixtures).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/matches", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
    expect(getActiveLeagues).not.toHaveBeenCalled();
  });

  it("fetches fixtures for each league with a known season and upserts them", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 204, currentSeason: null, oddsApiSportKey: null },
    ]);
    vi.mocked(getUpcomingFixtures).mockResolvedValue([
      {
        apiFixtureId: 1001,
        kickoffAt: "2026-09-20T15:00:00Z",
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
      },
    ]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getUpcomingFixtures).toHaveBeenCalledTimes(1);
    expect(getUpcomingFixtures).toHaveBeenCalledWith(39, 2026, expect.any(String), expect.any(String));
    expect(upsertMatches).toHaveBeenCalledWith(expect.anything(), [
      {
        league_id: "l1",
        api_football_fixture_id: 1001,
        home_team: "Manchester City",
        away_team: "Arsenal",
        home_team_api_id: 50,
        away_team_api_id: 42,
        kickoff_at: "2026-09-20T15:00:00Z",
      },
    ]);
    expect(body.totalUpserted).toBe(1);
  });
});
```

Run: `npx vitest run src/app/api/sync/matches/route.test.ts` — Expected: FAIL (`Cannot find module './route'`).

- [ ] **Step 9: `src/app/api/sync/matches/route.ts` implementasyonunu yaz**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeagues } from "@/lib/db/leagues";
import { upsertMatches } from "@/lib/db/matches";
import { getUpcomingFixtures } from "@/lib/api-football";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

const SYNC_WINDOW_DAYS = 14;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const leagues = (await getActiveLeagues(supabase)).filter((l) => l.currentSeason != null);

  const fromDate = formatDate(new Date());
  const toDate = formatDate(new Date(Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  let totalUpserted = 0;

  for (const league of leagues) {
    const fixtures = await getUpcomingFixtures(league.apiFootballId, league.currentSeason as number, fromDate, toDate);

    if (fixtures.length === 0) continue;

    const rows = fixtures.map((f) => ({
      league_id: league.id,
      api_football_fixture_id: f.apiFixtureId,
      home_team: f.homeTeam,
      away_team: f.awayTeam,
      home_team_api_id: f.homeTeamApiId,
      away_team_api_id: f.awayTeamApiId,
      kickoff_at: f.kickoffAt,
    }));

    await upsertMatches(supabase, rows);
    totalUpserted += rows.length;
  }

  return NextResponse.json({ ok: true, totalUpserted });
}
```

Run: `npx vitest run src/app/api/sync/matches/route.test.ts` — Expected: PASS, 2/2.

- [ ] **Step 10: Tüm test paketini çalıştır**

Run: `npm test`
Expected: Tüm testler PASS (önceki planlardan gelen 6 test + bu task'ın 12 testi = 18 test).

- [ ] **Step 11: Commit**

```bash
git add vitest.config.ts src/lib/sync-auth.ts src/lib/sync-auth.test.ts src/lib/db/leagues.ts src/lib/db/leagues.test.ts src/lib/db/matches.ts src/lib/db/matches.test.ts src/app/api/sync/matches/
git commit -m "feat: mac fikstur senkronizasyon route'u"
```

---

### Task 5: Takım İstatistiği + Sakatlık Senkronizasyonu

**Files:**
- Create: `src/lib/db/team-stats.ts`
- Test: `src/lib/db/team-stats.test.ts`
- Create: `src/app/api/sync/stats/route.ts`
- Test: `src/app/api/sync/stats/route.test.ts`

**Interfaces:**
- Consumes: `isSyncRequestAuthorized`, `getUpcomingMatches` (Task 4), `getRecentFixtures`, `getInjuriesForFixture` (Task 1), `getSupabaseClient` (Plan 1)
- Produces: `insertTeamStatsSnapshot(supabase, row): Promise<void>`; `POST /api/sync/stats`

- [ ] **Step 1: `db/team-stats` için başarısız testleri yaz**

`src/lib/db/team-stats.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { insertTeamStatsSnapshot } from "./team-stats";

describe("insertTeamStatsSnapshot", () => {
  it("inserts a row into team_stats_snapshots", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = { match_id: "m1", team: "home" as const, form: "WWDLW", injuries: [], last_matches: [] };

    await insertTeamStatsSnapshot({ from } as any, row);

    expect(from).toHaveBeenCalledWith("team_stats_snapshots");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertTeamStatsSnapshot({ from } as any, { match_id: "m1", team: "home", form: null, injuries: [], last_matches: [] }),
    ).rejects.toThrow("boom");
  });
});
```

Run: `npx vitest run src/lib/db/team-stats.test.ts` — Expected: FAIL.

- [ ] **Step 2: `src/lib/db/team-stats.ts` implementasyonunu yaz**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TeamStatsInsertRow {
  match_id: string;
  team: "home" | "away";
  form: string | null;
  injuries: unknown[];
  last_matches: unknown[];
}

export async function insertTeamStatsSnapshot(supabase: SupabaseClient, row: TeamStatsInsertRow): Promise<void> {
  const { error } = await supabase.from("team_stats_snapshots").insert(row);
  if (error) throw new Error(`Takim istatistigi kaydedilemedi: ${error.message}`);
}
```

Run: `npx vitest run src/lib/db/team-stats.test.ts` — Expected: PASS, 2/2.

- [ ] **Step 3: Route için başarısız testi yaz**

`src/app/api/sync/stats/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/team-stats", () => ({ insertTeamStatsSnapshot: vi.fn() }));
vi.mock("@/lib/api-football", () => ({ getRecentFixtures: vi.fn(), getInjuriesForFixture: vi.fn() }));

import { POST } from "./route";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertTeamStatsSnapshot } from "@/lib/db/team-stats";
import { getRecentFixtures, getInjuriesForFixture } from "@/lib/api-football";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/sync/stats", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(insertTeamStatsSnapshot).mockReset().mockResolvedValue(undefined);
  vi.mocked(getRecentFixtures).mockReset();
  vi.mocked(getInjuriesForFixture).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sync/stats", () => {
  it("returns 401 when unauthorized", async () => {
    const res = await POST(makeRequest("Bearer wrong") as any);
    expect(res.status).toBe(401);
  });

  it("inserts a home and away snapshot per upcoming match", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([
      {
        id: "m1",
        apiFixtureId: 1001,
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
        kickoffAt: "2026-09-20T15:00:00Z",
      },
    ]);
    vi.mocked(getRecentFixtures).mockImplementation(async (teamId: number) => [
      { apiFixtureId: 1, date: "2026-09-01", opponent: "X", goalsFor: 1, goalsAgainst: 0, result: teamId === 50 ? "W" : "L" },
    ]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(insertTeamStatsSnapshot).toHaveBeenCalledTimes(2);
    expect(insertTeamStatsSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ match_id: "m1", team: "home", form: "W" }),
    );
    expect(insertTeamStatsSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ match_id: "m1", team: "away", form: "L" }),
    );
  });
});
```

Run: `npx vitest run src/app/api/sync/stats/route.test.ts` — Expected: FAIL.

- [ ] **Step 4: `src/app/api/sync/stats/route.ts` implementasyonunu yaz**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertTeamStatsSnapshot } from "@/lib/db/team-stats";
import { getRecentFixtures, getInjuriesForFixture } from "@/lib/api-football";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

const STATS_SYNC_WINDOW_DAYS = 3;
const MAX_MATCHES_PER_RUN = 15;
const RECENT_FIXTURES_COUNT = 5;

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const matches = await getUpcomingMatches(supabase, STATS_SYNC_WINDOW_DAYS, MAX_MATCHES_PER_RUN);

  let processed = 0;
  for (const match of matches) {
    const [homeRecent, awayRecent, injuries] = await Promise.all([
      getRecentFixtures(match.homeTeamApiId, RECENT_FIXTURES_COUNT),
      getRecentFixtures(match.awayTeamApiId, RECENT_FIXTURES_COUNT),
      getInjuriesForFixture(match.apiFixtureId),
    ]);

    const injuriesArray = injuries as any[];

    await insertTeamStatsSnapshot(supabase, {
      match_id: match.id,
      team: "home",
      form: homeRecent.map((f) => f.result).join(""),
      injuries: injuriesArray.filter((inj) => inj?.team?.id === match.homeTeamApiId),
      last_matches: homeRecent,
    });

    await insertTeamStatsSnapshot(supabase, {
      match_id: match.id,
      team: "away",
      form: awayRecent.map((f) => f.result).join(""),
      injuries: injuriesArray.filter((inj) => inj?.team?.id === match.awayTeamApiId),
      last_matches: awayRecent,
    });

    processed += 1;
  }

  return NextResponse.json({ ok: true, processed });
}
```

Run: `npx vitest run src/app/api/sync/stats/route.test.ts` — Expected: PASS, 2/2.

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npm test`
Expected: Tüm testler PASS (18 + 4 = 22 test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/team-stats.ts src/lib/db/team-stats.test.ts src/app/api/sync/stats/
git commit -m "feat: takim istatistigi ve sakatlik senkronizasyon route'u"
```

---

### Task 6: Oran Senkronizasyonu

**Files:**
- Create: `src/lib/db/odds.ts`
- Test: `src/lib/db/odds.test.ts`
- Create: `src/app/api/sync/odds/route.ts`
- Test: `src/app/api/sync/odds/route.test.ts`

**Interfaces:**
- Consumes: `isSyncRequestAuthorized`, `getActiveLeagues` (Task 4), `getUpcomingMatches` (Task 4), `getOddsForSport` (Task 2), `getSupabaseClient` (Plan 1)
- Produces: `insertOddsSnapshots(supabase, rows): Promise<void>`; `POST /api/sync/odds`

- [ ] **Step 1: `db/odds` için başarısız testleri yaz**

`src/lib/db/odds.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { insertOddsSnapshots } from "./odds";

describe("insertOddsSnapshots", () => {
  it("does nothing when rows is empty", async () => {
    const insert = vi.fn();
    const from = vi.fn(() => ({ insert }));
    await insertOddsSnapshots({ from } as any, []);
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts rows into odds_snapshots", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const rows = [{ match_id: "m1", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 2.1 }];
    await insertOddsSnapshots({ from } as any, rows);
    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(insert).toHaveBeenCalledWith(rows);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertOddsSnapshots({ from } as any, [{ match_id: "m1", market: "h2h", outcome: "A", bookmaker: "b", price: 1 }]),
    ).rejects.toThrow("boom");
  });
});
```

Run: `npx vitest run src/lib/db/odds.test.ts` — Expected: FAIL.

- [ ] **Step 2: `src/lib/db/odds.ts` implementasyonunu yaz**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OddsInsertRow {
  match_id: string;
  market: string;
  outcome: string;
  bookmaker: string;
  price: number;
}

export async function insertOddsSnapshots(supabase: SupabaseClient, rows: OddsInsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("odds_snapshots").insert(rows);
  if (error) throw new Error(`Oranlar kaydedilemedi: ${error.message}`);
}
```

Run: `npx vitest run src/lib/db/odds.test.ts` — Expected: PASS, 3/3.

- [ ] **Step 3: Route için başarısız testi yaz**

`src/app/api/sync/odds/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/leagues", () => ({ getActiveLeagues: vi.fn() }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ insertOddsSnapshots: vi.fn() }));
vi.mock("@/lib/odds-api", () => ({ getOddsForSport: vi.fn() }));

import { POST } from "./route";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getUpcomingMatches } from "@/lib/db/matches";
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
  vi.mocked(getUpcomingMatches).mockReset();
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

  it("matches odds events to known matches by normalized team names and inserts them", async () => {
    vi.mocked(getActiveLeagues).mockResolvedValue([
      { id: "l1", apiFootballId: 39, currentSeason: 2026, oddsApiSportKey: "soccer_epl" },
      { id: "l2", apiFootballId: 204, currentSeason: null, oddsApiSportKey: null },
    ]);
    vi.mocked(getUpcomingMatches).mockResolvedValue([
      {
        id: "m1",
        apiFixtureId: 1001,
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        homeTeamApiId: 50,
        awayTeamApiId: 42,
        kickoffAt: "2026-09-20T15:00:00Z",
      },
    ]);
    vi.mocked(getOddsForSport).mockResolvedValue([
      {
        homeTeam: "Manchester City",
        awayTeam: "Arsenal",
        commenceTime: "2026-09-20T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Arsenal",
        price: 4.2,
      },
      {
        homeTeam: "Unknown Team A",
        awayTeam: "Unknown Team B",
        commenceTime: "2026-09-21T15:00:00Z",
        bookmaker: "pinnacle",
        market: "h2h",
        outcome: "Unknown Team A",
        price: 2.0,
      },
    ]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getOddsForSport).toHaveBeenCalledTimes(1);
    expect(getOddsForSport).toHaveBeenCalledWith("soccer_epl");
    expect(insertOddsSnapshots).toHaveBeenCalledWith(expect.anything(), [
      { match_id: "m1", market: "h2h", outcome: "Arsenal", bookmaker: "pinnacle", price: 4.2 },
    ]);
    expect(body.totalInserted).toBe(1);
    expect(body.totalUnmatched).toBe(1);
  });
});
```

Run: `npx vitest run src/app/api/sync/odds/route.test.ts` — Expected: FAIL.

- [ ] **Step 4: `src/app/api/sync/odds/route.ts` implementasyonunu yaz**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeagues } from "@/lib/db/leagues";
import { getUpcomingMatches } from "@/lib/db/matches";
import { insertOddsSnapshots } from "@/lib/db/odds";
import { getOddsForSport } from "@/lib/odds-api";
import { isSyncRequestAuthorized } from "@/lib/sync-auth";

const ODDS_SYNC_WINDOW_DAYS = 14;
const MAX_MATCHES_TO_MATCH_AGAINST = 200;

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const leagues = (await getActiveLeagues(supabase)).filter((l) => l.oddsApiSportKey);
  const matches = await getUpcomingMatches(supabase, ODDS_SYNC_WINDOW_DAYS, MAX_MATCHES_TO_MATCH_AGAINST);

  let totalInserted = 0;
  let totalUnmatched = 0;

  for (const league of leagues) {
    const quotes = await getOddsForSport(league.oddsApiSportKey as string);
    const rows = [];

    for (const quote of quotes) {
      const match = matches.find(
        (m) =>
          normalizeTeamName(m.homeTeam) === normalizeTeamName(quote.homeTeam) &&
          normalizeTeamName(m.awayTeam) === normalizeTeamName(quote.awayTeam),
      );

      if (!match) {
        totalUnmatched += 1;
        continue;
      }

      rows.push({
        match_id: match.id,
        market: quote.market,
        outcome: quote.outcome,
        bookmaker: quote.bookmaker,
        price: quote.price,
      });
    }

    await insertOddsSnapshots(supabase, rows);
    totalInserted += rows.length;
  }

  return NextResponse.json({ ok: true, totalInserted, totalUnmatched });
}
```

Run: `npx vitest run src/app/api/sync/odds/route.test.ts` — Expected: PASS, 2/2.

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npm test`
Expected: Tüm testler PASS (22 + 5 = 27 test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/odds.ts src/lib/db/odds.test.ts src/app/api/sync/odds/
git commit -m "feat: oran senkronizasyon route'u"
```

---

### Task 7: GitHub Actions Zamanlama

**Files:**
- Create: `.github/workflows/sync.yml`

**Interfaces:**
- Consumes: Task 4/5/6'nın `/api/sync/matches`, `/api/sync/stats`, `/api/sync/odds` route'ları (deploy edilmiş halleri, HTTP üzerinden)
- Produces: Zamanlanmış senkronizasyon tetikleyicisi. Bu, planın son parçası — kod tarafında başka hiçbir şey buna bağımlı değil.

- [ ] **Step 1: Workflow dosyasını oluştur**

`.github/workflows/sync.yml`:

```yaml
name: Veri Senkronizasyonu

on:
  schedule:
    - cron: "0 6 * * *"
    - cron: "0 18 * * *"
    - cron: "30 6 * * *"
    - cron: "0 8 * * *"
  workflow_dispatch: {}

jobs:
  sync-matches:
    if: github.event.schedule == '0 6 * * *' || github.event.schedule == '0 18 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger mac senkronizasyonu
        run: |
          curl -sf -X POST "${{ secrets.APP_BASE_URL }}/api/sync/matches" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"

  sync-stats:
    if: github.event.schedule == '30 6 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger takim istatistik senkronizasyonu
        run: |
          curl -sf -X POST "${{ secrets.APP_BASE_URL }}/api/sync/stats" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"

  sync-odds:
    if: github.event.schedule == '0 8 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger oran senkronizasyonu
        run: |
          curl -sf -X POST "${{ secrets.APP_BASE_URL }}/api/sync/odds" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Bu, fikstür senkronunu günde 2 kez (06:00 ve 18:00 UTC), istatistik senkronunu günde 1 kez (06:30 UTC), oran senkronunu günde 1 kez (08:00 UTC) çalıştırır — Global Constraints'teki bütçeyle eşleşir.

- [ ] **Step 2: GitHub repo secret'larını ekle (manuel)**

GitHub repo → Settings → Secrets and variables → Actions → şu iki secret'ı ekleyin:
- `APP_BASE_URL`: Vercel'de deploy edilen uygulamanın URL'i (örn. `https://bahis-analiz.vercel.app`), sonunda `/` olmadan.
- `CRON_SECRET`: `.env.local`/Vercel'deki ile birebir aynı değer.

- [ ] **Step 3: Manuel tetikleme ile doğrula**

GitHub repo → Actions → "Veri Senkronizasyonu" workflow'u → "Run workflow" (workflow_dispatch) ile üç job'u da manuel tetikleyin. Her job'un yeşil (başarılı) tamamlandığını ve Supabase Dashboard'da ilgili tablolarda (`matches`, `team_stats_snapshots`, `odds_snapshots`) yeni satırlar oluştuğunu doğrulayın.

**Not:** Bu adım kod değil, YAML + manuel doğrulama. Otomatik test yok — doğrulama gerçek bir tetikleme ile yapılır.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync.yml
git commit -m "feat: github actions ile veri senkronizasyon zamanlamasi"
```

## Self-Review Notları

- **Spec kapsaması:** §3 (veri kaynakları + kısıtlamalar) → Task 1, 2, Global Constraints (kota bütçesi). §4 (lig listesi) → Task 3 (LEAGUE_CATALOG, tüm 15 giriş dahil). §6 (veri modeli, yeni kolonlar) → Task 3 migration. §7 (hata yönetimi) → tüm route'larda try/catch yerine "başarısız API çağrısı null/[] döner, akış devam eder" deseni + Global Constraints. §2 (GitHub Actions mimarisi) → Task 7. §5/§8 (kullanıcı akışı, auth) bu plana girmiyor — Plan 4'te (Arayüz).
- **Placeholder taraması:** Tüm adımlarda gerçek kod var. Sakatlık verisinin (`injuries`) tam alan adları API-Football'un birincil dokümantasyonundan doğrulanamadı (bkz. Global Constraints) — bu, kod TODO'su değil, bilinçli olarak ham JSON olarak saklanan ve AI aşamasında yorumlanacak bir tasarım kararı, plan içinde açıkça belirtildi.
- **Tip tutarlılığı:** `SyncLeague`, `SyncMatch`, `ApiFootballFixture`, `RecentFixtureResult`, `OddsQuote` tipleri Task 1/2/4'te tanımlanıp sonraki task'larda aynı isim ve alanlarla tekrar kullanıldı. `getActiveLeagues`/`getUpcomingMatches`/`upsertMatches` imzaları Task 4'te tanımlandı, Task 5/6 bunları birebir aynı şekilde içe aktarıyor.
