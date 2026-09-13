# Arayüz (Frontend UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının lig seçip yaklaşan maçları listeleyebildiği bir ana sayfa, ve her maç için istatistik/oran/oran-geçmişi-grafiği/3-persona AI analizi gösteren ve kullanıcının gördüğü İddaa/Bilyoner oranını girip referans oranla farkını görebildiği bir detay sayfası eklemek.

**Architecture:** Next.js App Router, ağırlıklı olarak Server Component'ler (Supabase'den doğrudan sunucu tarafında veri okur, `getSupabaseClient()` zaten `server-only` korumalı). Etkileşim gereken iki yer Client Component: lig checkbox filtresi (istemci tarafında zaten yüklenmiş maç listesini filtreler, ekstra sunucu isteği yok) ve manuel oran giriş formu (Server Action ile gönderilir). Görsel oran-geçmişi grafiği bağımlılıksız, saf SVG ile (yeni npm paketi yok — maliyet/boyut sıfır).

**Tech Stack:** Next.js 16 App Router (Server + Client Components, Server Actions), CSS Modules (proje zaten bu şekilde kurulu, Tailwind YOK — mevcut kurulumla tutarlılık için eklenmiyor), saf inline SVG grafik (yeni bağımlılık yok), mevcut Supabase/vitest altyapısı.

**Spec:** [docs/superpowers/specs/2026-09-08-bahis-analiz-app-design.md](../specs/2026-09-08-bahis-analiz-app-design.md) (§4 lig listesi, §5 kullanıcı akışı, §6 veri modeli, §7 hata yönetimi, §10 test yaklaşımı)

## Global Constraints

- Auth yok — sayfalar herkese (linki bilen) açık (spec §8).
- Eksik veri asla hataya yol açmaz: istatistik/oran/analiz yoksa sayfa kırılmaz, "veri mevcut değil" mesajı gösterilir (spec §3, §7) — hiçbir bileşen bir maçta veri olacağını varsaymaz.
- Referans oranlar İddaa/Nesine/Bilyoner'in kendi oranı DEĞİLDİR — bu spec §3'te belirtilen fark açıkça arayüzde belirtilmeli (manuel oran karşılaştırma bölümünde).
- **Next.js 16 kırıcı değişiklikler (bu proje `AGENTS.md`'de uyarıyor, eğitim verisi güncel değil — `node_modules/next/dist/docs/` içinden doğrulandı):**
  - Dinamik route `params` artık **Promise** — `params: Promise<{ id: string }>` şeklinde tiplenir ve `await params` ile okunur (senkron erişim kaldırılmıştır).
  - `PageProps<'/route'>` gibi global tip yardımcıları sadece `next dev`/`next build`/`next typegen` çalıştıktan SONRA üretilir. Bu repoda `layout.tsx` zaten `LayoutProps<"/">` kullanıyor ve bilinen, önceki planlardan beri var olan, ilgisiz bir `tsc` hatası üretiyor (`Cannot find name 'LayoutProps'`) çünkü tip üretimi hiç çalıştırılmamış. **Bu planda yeni sayfalarda `PageProps`/`LayoutProps` yardımcı tipleri KULLANILMAYACAK** — bunun yerine `{ params }: { params: Promise<{ id: string }> }` gibi açık, codegen'e bağımlı olmayan tipleme kullanılacak. Bu, aynı sorunun yeni bir örneğini eklemekten kaçınır.
  - Server Actions: `'use server'` direktifi, `useActionState` ile form durumu/hata gösterimi, mutasyon sonrası `revalidatePath(path, 'page')` (dinamik segment için `type` parametresi zorunlu).
- Test yaklaşımı: Spec §10 açıkça "Arayüz için: temel akış ... manuel/entegrasyon testi ile doğrulanır" diyor — yani **UI sayfaları/bileşenleri için otomatik component testi YAZILMAYACAK** (React Testing Library/jsdom bu projede kurulu değil, kurulmasına gerek yok). UI görevlerinin doğrulaması: `npm run build` (tip kontrolü + derleme) + `npm run lint` + kontrolcü oturumunun görev tamamlandıktan sonra tarayıcıda manuel kontrolü. Saf mantık (DB yardımcıları, grafik veri dönüştürücü, karşılaştırma fonksiyonu) her zamanki gibi vitest ile TDD test edilir.
- Yeni/değiştirilen dosyalar mevcut kod tabanı konvansiyonlarını izler: `SupabaseClient` parametresi alan DB yardımcıları, Türkçe hata mesajları, camelCase dönüş tipleri.
- **Mevcut senkron route'ların kullandığı `SyncMatch`/`getUpcomingMatches` (matches.ts) ve `SyncLeague`/`getActiveLeagues` (leagues.ts) DEĞİŞTİRİLMEYECEK** — bu tipler zaten Plan 2/3'ün 4 route'unda ve onların testlerinde kullanılıyor; alan eklemek o dosyalardaki mock literal'leri kırar (TypeScript zorunlu-alan hatası). Bunun yerine arayüze özel YENİ fonksiyonlar/tipler eklenir (aşağıda). Bu saf ekleme, hiçbir mevcut dosyayı riske atmaz.

---

## Mevcut Kod Tabanı Referansları (yeni kod bunlarla tutarlı olmalı)

- `src/lib/supabase.ts` → `getSupabaseClient(): SupabaseClient` (server-only korumalı).
- `src/lib/db/team-stats.ts` → `getLatestTeamStats(supabase, matchId): Promise<LatestTeamStats[]>` (Plan 3) — `LatestTeamStats = { team: "home"|"away", form: string|null, injuries: unknown[], cards: unknown[], lastMatches: unknown[], fetchedAt: string }`.
- `src/lib/db/odds.ts` → `getLatestOdds(supabase, matchId): Promise<LatestOddsQuote[]>` (Plan 3) — `LatestOddsQuote = { outcome: string, bookmaker: string, price: number, fetchedAt: string }`.
- `src/lib/db/ai-analyses.ts` → mevcut `insertAiAnalysis`, `getLatestAnalysisGeneratedAt`, `needsFreshAnalysis` (Plan 3) — bu plan `getLatestAnalysis` (tam metin okuma) ekliyor.
- Migration `supabase/migrations/0001_init.sql` — `manual_odds` tablosu ZATEN mevcut: `id, match_id, entered_by, market, outcome, price, entered_at`. **Yeni migration gerekmiyor.**
- `leagues` tablosu kolonları: `id, name, country, api_football_id, odds_api_sport_key, active, created_at` (migration 0001).
- `matches` tablosu kolonları: `id, league_id, api_football_fixture_id, home_team, away_team, home_team_api_id, away_team_api_id, kickoff_at` (migration 0001/0002).
- `src/app/globals.css` — zaten açık/koyu tema CSS değişkenleri (`--background`, `--foreground`) ve mobil-uyumlu temel reset içeriyor (`max-width: 100vw`, flex body). Yeni CSS bunun üzerine inşa eder.
- `src/app/page.tsx` / `src/app/page.module.css` — şu an create-next-app placeholder'ı, bu planda tamamen değiştirilecek.

---

### Task 1: Arayüze özel DB yardımcıları — ligler ve maçlar

**Files:**
- Modify: `src/lib/db/leagues.ts`
- Modify: `src/lib/db/matches.ts`
- Modify: `src/lib/db/leagues.test.ts`
- Modify: `src/lib/db/matches.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` tipi.
- Produces: `DisplayLeague` tipi, `getActiveLeaguesForDisplay(supabase): Promise<DisplayLeague[]>`, `getLeagueById(supabase, id): Promise<DisplayLeague | null>` (`leagues.ts`); `DisplayMatch` tipi, `getUpcomingMatchesWithLeague(supabase, withinDays, limit): Promise<DisplayMatch[]>`, `getMatchById(supabase, id): Promise<DisplayMatch | null>` (`matches.ts`) — Task 5 (ana sayfa) ve Task 6 (detay sayfası) bunları kullanır.

- [ ] **Step 1: Başarısız testleri ekle (leagues.test.ts)**

`src/lib/db/leagues.test.ts` dosyasının sonuna ekle:

```typescript
import { getActiveLeaguesForDisplay, getLeagueById } from "./leagues";

describe("getActiveLeaguesForDisplay", () => {
  it("returns id/name/country for active leagues, ordered by name", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "l1", name: "Premier League", country: "England" },
        { id: "l2", name: "Süper Lig", country: "Turkey" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getActiveLeaguesForDisplay({ from } as any);

    expect(from).toHaveBeenCalledWith("leagues");
    expect(eq).toHaveBeenCalledWith("active", true);
    expect(result).toEqual([
      { id: "l1", name: "Premier League", country: "England" },
      { id: "l2", name: "Süper Lig", country: "Turkey" },
    ]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getActiveLeaguesForDisplay({ from } as any)).rejects.toThrow("boom");
  });
});

describe("getLeagueById", () => {
  it("returns the league when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "l1", name: "Premier League", country: "England" },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLeagueById({ from } as any, "l1");

    expect(from).toHaveBeenCalledWith("leagues");
    expect(eq).toHaveBeenCalledWith("id", "l1");
    expect(result).toEqual({ id: "l1", name: "Premier League", country: "England" });
  });

  it("returns null when not found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getLeagueById({ from } as any, "missing");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getLeagueById({ from } as any, "l1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Başarısız testleri ekle (matches.test.ts)**

`src/lib/db/matches.test.ts` dosyasının sonuna ekle:

```typescript
import { getUpcomingMatchesWithLeague, getMatchById } from "./matches";

describe("getUpcomingMatchesWithLeague", () => {
  it("returns display-shaped matches within the window", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "m1",
          league_id: "l1",
          home_team: "Arsenal",
          away_team: "Chelsea",
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

    const result = await getUpcomingMatchesWithLeague({ from } as any, 14, 300);

    expect(from).toHaveBeenCalledWith("matches");
    expect(limit).toHaveBeenCalledWith(300);
    expect(result).toEqual([
      { id: "m1", leagueId: "l1", homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-09-20T15:00:00Z" },
    ]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));
    await expect(getUpcomingMatchesWithLeague({ from } as any, 14, 300)).rejects.toThrow("boom");
  });
});

describe("getMatchById", () => {
  it("returns the match when found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "m1",
        league_id: "l1",
        home_team: "Arsenal",
        away_team: "Chelsea",
        kickoff_at: "2026-09-20T15:00:00Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getMatchById({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("matches");
    expect(eq).toHaveBeenCalledWith("id", "m1");
    expect(result).toEqual({
      id: "m1",
      leagueId: "l1",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      kickoffAt: "2026-09-20T15:00:00Z",
    });
  });

  it("returns null when not found", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getMatchById({ from } as any, "missing");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getMatchById({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/db/leagues.test.ts src/lib/db/matches.test.ts`
Expected: FAIL — yeni fonksiyonlar henüz export edilmiyor.

- [ ] **Step 4: `getActiveLeaguesForDisplay` ve `getLeagueById`'i `leagues.ts`'e ekle**

`src/lib/db/leagues.ts` dosyasının sonuna ekle (mevcut `SyncLeague`/`getActiveLeagues`'e DOKUNMA):

```typescript
export interface DisplayLeague {
  id: string;
  name: string;
  country: string;
}

export async function getActiveLeaguesForDisplay(supabase: SupabaseClient): Promise<DisplayLeague[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, country")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(`Ligler alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    name: string;
    country: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
  }));
}

export async function getLeagueById(supabase: SupabaseClient, id: string): Promise<DisplayLeague | null> {
  const { data, error } = await supabase.from("leagues").select("id, name, country").eq("id", id).maybeSingle();

  if (error) throw new Error(`Lig alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; name: string; country: string };
  return { id: row.id, name: row.name, country: row.country };
}
```

- [ ] **Step 5: `getUpcomingMatchesWithLeague` ve `getMatchById`'i `matches.ts`'e ekle**

`src/lib/db/matches.ts` dosyasının sonuna ekle (mevcut `SyncMatch`/`getUpcomingMatches`'e DOKUNMA):

```typescript
export interface DisplayMatch {
  id: string;
  leagueId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
}

export async function getUpcomingMatchesWithLeague(
  supabase: SupabaseClient,
  withinDays: number,
  limit: number,
): Promise<DisplayMatch[]> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("matches")
    .select("id, league_id, home_team, away_team, kickoff_at")
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", untilIso)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Yaklasan maclar alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    league_id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
  }));
}

export async function getMatchById(supabase: SupabaseClient, id: string): Promise<DisplayMatch | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, league_id, home_team, away_team, kickoff_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Mac alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; league_id: string; home_team: string; away_team: string; kickoff_at: string };
  return {
    id: row.id,
    leagueId: row.league_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
  };
}
```

- [ ] **Step 6: Testlerin geçtiğini doğrula**

Run: `npx vitest run src/lib/db/leagues.test.ts src/lib/db/matches.test.ts`
Expected: PASS (eskiler + yeni 10 test)

- [ ] **Step 7: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS, hiçbir regresyon yok (mevcut `SyncLeague`/`SyncMatch` kullanan hiçbir dosyaya dokunulmadı).

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/leagues.ts src/lib/db/matches.ts src/lib/db/leagues.test.ts src/lib/db/matches.test.ts
git commit -m "feat: arayuz icin lig ve mac gorunum yardimcilari"
```

---

### Task 2: Arayüze özel DB yardımcıları — oran geçmişi ve tam AI analizi

**Files:**
- Modify: `src/lib/db/odds.ts`
- Modify: `src/lib/db/ai-analyses.ts`
- Modify: `src/lib/db/odds.test.ts`
- Modify: `src/lib/db/ai-analyses.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` tipi.
- Produces: `OddsHistoryPoint` tipi, `getOddsHistory(supabase, matchId): Promise<OddsHistoryPoint[]>` (`odds.ts`); `LatestAnalysis` tipi, `getLatestAnalysis(supabase, matchId): Promise<LatestAnalysis | null>` (`ai-analyses.ts`) — Task 4 (grafik) ve Task 6 (detay sayfası) bunları kullanır.

- [ ] **Step 1: Başarısız testleri ekle (odds.test.ts)**

`src/lib/db/odds.test.ts` dosyasının sonuna ekle:

```typescript
import { getOddsHistory } from "./odds";

describe("getOddsHistory", () => {
  it("returns the full snapshot history for a match, oldest first", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-12T12:00:00Z" },
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getOddsHistory({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(order).toHaveBeenCalledWith("fetched_at", { ascending: true });
    expect(result).toEqual([
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9 },
      { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
    ]);
  });

  it("returns an empty array when no history exists", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getOddsHistory({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getOddsHistory({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Başarısız testleri ekle (ai-analyses.test.ts)**

`src/lib/db/ai-analyses.test.ts` dosyasının sonuna ekle:

```typescript
import { getLatestAnalysis } from "./ai-analyses";

describe("getLatestAnalysis", () => {
  it("returns the most recent full analysis for the match", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          team_analyst_text: "takim analizi",
          betting_analyst_text: "bahis analizi",
          commentator_text: "yorum",
          summary_text: "ozet",
          model_used: "gemini-3.5-flash-lite",
          generated_at: "2026-09-13T10:00:00Z",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysis({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual({
      teamAnalystText: "takim analizi",
      bettingAnalystText: "bahis analizi",
      commentatorText: "yorum",
      summaryText: "ozet",
      modelUsed: "gemini-3.5-flash-lite",
      generatedAt: "2026-09-13T10:00:00Z",
    });
  });

  it("returns null when no analysis exists yet", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getLatestAnalysis({ from } as any, "m1");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getLatestAnalysis({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/db/odds.test.ts src/lib/db/ai-analyses.test.ts`
Expected: FAIL — yeni fonksiyonlar henüz export edilmiyor.

- [ ] **Step 4: `getOddsHistory`'i `odds.ts`'e ekle**

`src/lib/db/odds.ts` dosyasının sonuna ekle:

```typescript
export interface OddsHistoryPoint {
  fetchedAt: string;
  outcome: string;
  bookmaker: string;
  price: number;
}

export async function getOddsHistory(supabase: SupabaseClient, matchId: string): Promise<OddsHistoryPoint[]> {
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("outcome, bookmaker, price, fetched_at")
    .eq("match_id", matchId)
    .order("fetched_at", { ascending: true });

  if (error) throw new Error(`Oran gecmisi alinamadi: ${error.message}`);

  interface RawRow {
    outcome: string;
    bookmaker: string;
    price: number;
    fetched_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    fetchedAt: row.fetched_at,
    outcome: row.outcome,
    bookmaker: row.bookmaker,
    price: row.price,
  }));
}
```

- [ ] **Step 5: `getLatestAnalysis`'i `ai-analyses.ts`'e ekle**

`src/lib/db/ai-analyses.ts` dosyasının sonuna ekle:

```typescript
export interface LatestAnalysis {
  teamAnalystText: string;
  bettingAnalystText: string;
  commentatorText: string;
  summaryText: string;
  modelUsed: string;
  generatedAt: string;
}

export async function getLatestAnalysis(supabase: SupabaseClient, matchId: string): Promise<LatestAnalysis | null> {
  const { data, error } = await supabase
    .from("ai_analyses")
    .select("team_analyst_text, betting_analyst_text, commentator_text, summary_text, model_used, generated_at")
    .eq("match_id", matchId)
    .order("generated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`AI analizi alinamadi: ${error.message}`);

  interface RawRow {
    team_analyst_text: string;
    betting_analyst_text: string;
    commentator_text: string;
    summary_text: string;
    model_used: string;
    generated_at: string;
  }

  const rows = (data ?? []) as RawRow[];
  const row = rows[0];
  if (!row) return null;

  return {
    teamAnalystText: row.team_analyst_text,
    bettingAnalystText: row.betting_analyst_text,
    commentatorText: row.commentator_text,
    summaryText: row.summary_text,
    modelUsed: row.model_used,
    generatedAt: row.generated_at,
  };
}
```

- [ ] **Step 6: Testlerin geçtiğini doğrula**

Run: `npx vitest run src/lib/db/odds.test.ts src/lib/db/ai-analyses.test.ts`
Expected: PASS (eskiler + yeni 6 test)

- [ ] **Step 7: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS, hiçbir regresyon yok.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/odds.ts src/lib/db/ai-analyses.ts src/lib/db/odds.test.ts src/lib/db/ai-analyses.test.ts
git commit -m "feat: oran gecmisi ve tam ai analizi okuma yardimcilari"
```

---

### Task 3: Manuel oran DB yardımcıları

**Files:**
- Create: `src/lib/db/manual-odds.ts`
- Test: `src/lib/db/manual-odds.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` tipi. `manual_odds` tablosu zaten mevcut (migration 0001).
- Produces: `ManualOddsInsertRow` tipi, `insertManualOdds(supabase, row): Promise<void>`; `ManualOddsRecord` tipi, `getManualOddsForMatch(supabase, matchId): Promise<ManualOddsRecord[]>` — Task 7 (form + karşılaştırma) bunları kullanır.

- [ ] **Step 1: Başarısız testleri yaz**

```typescript
// src/lib/db/manual-odds.test.ts
import { describe, it, expect, vi } from "vitest";
import { insertManualOdds, getManualOddsForMatch } from "./manual-odds";

describe("insertManualOdds", () => {
  it("inserts a row into manual_odds", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = { match_id: "m1", entered_by: "Ali", market: "h2h", outcome: "Arsenal", price: 1.85 };

    await insertManualOdds({ from } as any, row);

    expect(from).toHaveBeenCalledWith("manual_odds");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertManualOdds({ from } as any, {
        match_id: "m1",
        entered_by: "Ali",
        market: "h2h",
        outcome: "Arsenal",
        price: 1.85,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("getManualOddsForMatch", () => {
  it("returns entries for the match, newest first", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "e1", entered_by: "Ali", outcome: "Arsenal", price: 1.85, entered_at: "2026-09-13T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getManualOddsForMatch({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("manual_odds");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(order).toHaveBeenCalledWith("entered_at", { ascending: false });
    expect(result).toEqual([
      { id: "e1", enteredBy: "Ali", outcome: "Arsenal", price: 1.85, enteredAt: "2026-09-13T12:00:00Z" },
    ]);
  });

  it("returns an empty array when no entries exist", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const result = await getManualOddsForMatch({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(getManualOddsForMatch({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/db/manual-odds.test.ts`
Expected: FAIL — `Cannot find module './manual-odds'`

- [ ] **Step 3: Minimal implementasyonu yaz**

```typescript
// src/lib/db/manual-odds.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ManualOddsInsertRow {
  match_id: string;
  entered_by: string;
  market: string;
  outcome: string;
  price: number;
}

export async function insertManualOdds(supabase: SupabaseClient, row: ManualOddsInsertRow): Promise<void> {
  const { error } = await supabase.from("manual_odds").insert(row);
  if (error) throw new Error(`Manuel oran kaydedilemedi: ${error.message}`);
}

export interface ManualOddsRecord {
  id: string;
  enteredBy: string;
  outcome: string;
  price: number;
  enteredAt: string;
}

export async function getManualOddsForMatch(supabase: SupabaseClient, matchId: string): Promise<ManualOddsRecord[]> {
  const { data, error } = await supabase
    .from("manual_odds")
    .select("id, entered_by, outcome, price, entered_at")
    .eq("match_id", matchId)
    .order("entered_at", { ascending: false });

  if (error) throw new Error(`Manuel oranlar alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    entered_by: string;
    outcome: string;
    price: number;
    entered_at: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    enteredBy: row.entered_by,
    outcome: row.outcome,
    price: row.price,
    enteredAt: row.entered_at,
  }));
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/db/manual-odds.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS, hiçbir regresyon yok.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/manual-odds.ts src/lib/db/manual-odds.test.ts
git commit -m "feat: manuel oran db yardimcilari"
```

---

### Task 4: Oran geçmişi grafiği için saf veri dönüştürücü

**Files:**
- Create: `src/lib/odds-chart.ts`
- Test: `src/lib/odds-chart.test.ts`

**Interfaces:**
- Consumes: `OddsHistoryPoint` tipi (Task 2, `src/lib/db/odds.ts`) — sadece şekil olarak, import etmeden kendi tipini tanımlar (saf modül, DB'ye bağımlı değil).
- Produces: `ChartPoint`, `ChartSeries` tipleri, `buildOddsChartSeries(history, width?, height?): ChartSeries[]`, `averagePricesByOutcome(quotes): Map<string, number>` — Task 6 (grafik render) ve Task 7 (karşılaştırma) bunları kullanır.

- [ ] **Step 1: Başarısız testleri yaz**

```typescript
// src/lib/odds-chart.test.ts
import { describe, it, expect } from "vitest";
import { buildOddsChartSeries, averagePricesByOutcome } from "./odds-chart";

describe("averagePricesByOutcome", () => {
  it("averages prices across bookmakers for the same outcome", () => {
    const result = averagePricesByOutcome([
      { outcome: "Arsenal", price: 1.8 },
      { outcome: "Arsenal", price: 2.0 },
      { outcome: "Draw", price: 3.5 },
    ]);
    expect(result.get("Arsenal")).toBe(1.9);
    expect(result.get("Draw")).toBe(3.5);
  });

  it("returns an empty map for no quotes", () => {
    const result = averagePricesByOutcome([]);
    expect(result.size).toBe(0);
  });
});

describe("buildOddsChartSeries", () => {
  it("returns an empty array when there is no history", () => {
    expect(buildOddsChartSeries([])).toEqual([]);
  });

  it("groups by outcome and averages multiple bookmakers at the same timestamp", () => {
    const series = buildOddsChartSeries(
      [
        { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
        { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "bet365", price: 2.0 },
        { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9 },
      ],
      300,
      100,
    );

    expect(series).toHaveLength(1);
    expect(series[0].outcome).toBe("Arsenal");
    expect(series[0].points).toHaveLength(2);
    // First timestamp -> x=0 (earliest), last timestamp -> x=width (latest)
    expect(series[0].points[0].x).toBe(0);
    expect(series[0].points[1].x).toBe(300);
  });

  it("produces one series per distinct outcome", () => {
    const series = buildOddsChartSeries([
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 },
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Draw", bookmaker: "pinnacle", price: 3.5 },
      { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Chelsea", bookmaker: "pinnacle", price: 4.2 },
    ]);
    expect(series.map((s) => s.outcome).sort()).toEqual(["Arsenal", "Chelsea", "Draw"]);
  });

  it("maps a single timestamp to the horizontal center of the chart", () => {
    const series = buildOddsChartSeries(
      [{ fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8 }],
      300,
      100,
    );
    expect(series[0].points[0].x).toBe(150);
  });

  it("maps the lowest price to the bottom (y=height) and highest to the top (y=0)", () => {
    const series = buildOddsChartSeries(
      [
        { fetchedAt: "2026-09-12T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 1.5 },
        { fetchedAt: "2026-09-13T12:00:00Z", outcome: "Arsenal", bookmaker: "pinnacle", price: 3.0 },
      ],
      300,
      100,
    );
    expect(series[0].points[0].y).toBe(100);
    expect(series[0].points[1].y).toBe(0);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/odds-chart.test.ts`
Expected: FAIL — `Cannot find module './odds-chart'`

- [ ] **Step 3: Minimal implementasyonu yaz**

```typescript
// src/lib/odds-chart.ts
export interface OddsHistoryPoint {
  fetchedAt: string;
  outcome: string;
  bookmaker: string;
  price: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  outcome: string;
  points: ChartPoint[];
}

export function averagePricesByOutcome(quotes: { outcome: string; price: number }[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const q of quotes) {
    const entry = sums.get(q.outcome) ?? { total: 0, count: 0 };
    entry.total += q.price;
    entry.count += 1;
    sums.set(q.outcome, entry);
  }
  const result = new Map<string, number>();
  for (const [outcome, { total, count }] of sums) {
    result.set(outcome, total / count);
  }
  return result;
}

export function buildOddsChartSeries(history: OddsHistoryPoint[], width = 300, height = 100): ChartSeries[] {
  if (history.length === 0) return [];

  const byOutcome = new Map<string, Map<string, number[]>>();
  for (const point of history) {
    if (!byOutcome.has(point.outcome)) byOutcome.set(point.outcome, new Map());
    const byTime = byOutcome.get(point.outcome)!;
    if (!byTime.has(point.fetchedAt)) byTime.set(point.fetchedAt, []);
    byTime.get(point.fetchedAt)!.push(point.price);
  }

  const allTimestamps = [...new Set(history.map((h) => h.fetchedAt))].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const allPrices = history.map((h) => h.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  const series: ChartSeries[] = [];
  for (const [outcome, byTime] of byOutcome) {
    const sortedTimestamps = [...byTime.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const points: ChartPoint[] = sortedTimestamps.map((ts) => {
      const prices = byTime.get(ts)!;
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const timeIndex = allTimestamps.indexOf(ts);
      const x = allTimestamps.length > 1 ? (timeIndex / (allTimestamps.length - 1)) * width : width / 2;
      const y = height - ((avg - minPrice) / priceRange) * height;
      return { x, y };
    });
    series.push({ outcome, points });
  }

  return series;
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/odds-chart.test.ts`
Expected: PASS (8 test)

- [ ] **Step 5: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS, hiçbir regresyon yok.

- [ ] **Step 6: Commit**

```bash
git add src/lib/odds-chart.ts src/lib/odds-chart.test.ts
git commit -m "feat: oran gecmisi grafigi icin saf veri donusturucu"
```

---

### Task 5: Ana sayfa — lig checkbox filtresi ve maç listesi

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`
- Modify: `src/app/page.tsx` (mevcut placeholder'ı tamamen değiştirir)
- Modify: `src/app/page.module.css` (mevcut placeholder CSS'i tamamen değiştirir)
- Create: `src/app/league-match-list.tsx`
- Create: `src/app/league-match-list.module.css`

**Interfaces:**
- Consumes: `getActiveLeaguesForDisplay`, `DisplayLeague` ve `getUpcomingMatchesWithLeague`, `DisplayMatch` (Task 1, `src/lib/db/leagues.ts` + `src/lib/db/matches.ts`); `getSupabaseClient` (mevcut, `src/lib/supabase.ts`).
- Produces: `formatKickoffTime(iso: string): string` (`src/lib/format.ts`) — Task 6 da bunu kullanır. `LeagueMatchList` client component — sadece bu sayfada kullanılır, başka görev tüketmez.

- [ ] **Step 1: `formatKickoffTime` için başarısız test yaz**

```typescript
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatKickoffTime } from "./format";

describe("formatKickoffTime", () => {
  it("formats an ISO timestamp as a Turkish-localized date/time string", () => {
    const result = formatKickoffTime("2026-09-20T15:00:00.000Z");
    // Exact locale string rendering can vary by ICU data, so assert on
    // the stable, always-present pieces rather than the full string.
    expect(result).toContain("2026");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `Cannot find module './format'`

- [ ] **Step 3: `formatKickoffTime`'ı yaz**

```typescript
// src/lib/format.ts
export function formatKickoffTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Ana sayfayı yaz (Server Component)**

`src/app/page.tsx` dosyasının TAMAMINI şununla değiştir:

```tsx
import { getSupabaseClient } from "@/lib/supabase";
import { getActiveLeaguesForDisplay } from "@/lib/db/leagues";
import { getUpcomingMatchesWithLeague } from "@/lib/db/matches";
import { LeagueMatchList } from "./league-match-list";
import styles from "./page.module.css";

const HOME_WINDOW_DAYS = 14;
const HOME_MATCH_LIMIT = 300;

export default async function HomePage() {
  const supabase = getSupabaseClient();
  const [leagues, matches] = await Promise.all([
    getActiveLeaguesForDisplay(supabase),
    getUpcomingMatchesWithLeague(supabase, HOME_WINDOW_DAYS, HOME_MATCH_LIMIT),
  ]);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Bahis Analiz</h1>
      <p className={styles.subtitle}>
        Referans oranlar uluslararasi bookmaker&apos;lardan gelir, Iddaa/Bilyoner&apos;deki oranla birebir ayni
        degildir.
      </p>
      <LeagueMatchList leagues={leagues} matches={matches} />
    </main>
  );
}
```

- [ ] **Step 6: Lig/maç filtre bileşenini yaz (Client Component)**

```tsx
// src/app/league-match-list.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { DisplayLeague } from "@/lib/db/leagues";
import type { DisplayMatch } from "@/lib/db/matches";
import { formatKickoffTime } from "@/lib/format";
import styles from "./league-match-list.module.css";

export function LeagueMatchList({ leagues, matches }: { leagues: DisplayLeague[]; matches: DisplayMatch[] }) {
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<string>>(() => new Set(leagues.map((l) => l.id)));

  function toggleLeague(id: string) {
    setSelectedLeagueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const matchesByLeague = new Map<string, DisplayMatch[]>();
  for (const match of matches) {
    if (!selectedLeagueIds.has(match.leagueId)) continue;
    if (!matchesByLeague.has(match.leagueId)) matchesByLeague.set(match.leagueId, []);
    matchesByLeague.get(match.leagueId)!.push(match);
  }

  return (
    <div className={styles.container}>
      <fieldset className={styles.leagueFilter}>
        <legend>Ligler</legend>
        {leagues.map((league) => (
          <label key={league.id} className={styles.leagueCheckbox}>
            <input
              type="checkbox"
              checked={selectedLeagueIds.has(league.id)}
              onChange={() => toggleLeague(league.id)}
            />
            {league.name} ({league.country})
          </label>
        ))}
      </fieldset>

      <div className={styles.matchList}>
        {leagues.map((league) => {
          const leagueMatches = matchesByLeague.get(league.id);
          if (!leagueMatches || leagueMatches.length === 0) return null;
          return (
            <section key={league.id} className={styles.leagueSection}>
              <h2 className={styles.leagueName}>
                {league.name} <span className={styles.leagueCountry}>({league.country})</span>
              </h2>
              <ul className={styles.matches}>
                {leagueMatches.map((match) => (
                  <li key={match.id}>
                    <Link href={`/matches/${match.id}`} className={styles.matchLink}>
                      <span className={styles.teams}>
                        {match.homeTeam} - {match.awayTeam}
                      </span>
                      <span className={styles.kickoff}>{formatKickoffTime(match.kickoffAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {matchesByLeague.size === 0 && <p className={styles.empty}>Secili liglerde yaklasan mac yok.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Stilleri yaz**

```css
/* src/app/page.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 64px;
}

.title {
  font-size: 28px;
  font-weight: 700;
}

.subtitle {
  font-size: 14px;
  color: var(--foreground);
  opacity: 0.7;
}
```

```css
/* src/app/league-match-list.module.css */
.container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.leagueFilter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 8px;
  padding: 12px;
}

.leagueCheckbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}

.matchList {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.leagueSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.leagueName {
  font-size: 16px;
  font-weight: 600;
}

.leagueCountry {
  font-weight: 400;
  opacity: 0.6;
  font-size: 13px;
}

.matches {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.matchLink {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}

.teams {
  font-weight: 500;
}

.kickoff {
  font-size: 13px;
  opacity: 0.7;
  white-space: nowrap;
}

.empty {
  opacity: 0.7;
  font-size: 14px;
}

@media (max-width: 480px) {
  .matchLink {
    flex-direction: column;
    gap: 4px;
  }
}
```

- [ ] **Step 8: Derleme ve lint kontrolü**

Run: `npx tsc --noEmit`
Expected: Bilinen, ilgisiz `src/app/layout.tsx` `LayoutProps` hatası dışında yeni hata YOK (bu görev `PageProps`/`LayoutProps` kullanmıyor, kendi dosyalarında tip hatası olmamalı).

Run: `npm run lint`
Expected: `src/app/page.tsx`, `src/app/league-match-list.tsx` için hata yok.

Run: `npm run build`
Expected: Derleme başarılı (gerçek Supabase env değişkenleri olmadan build zaman aşımına uğrarsa veya env hatası verirse — bu normal, bu proje şu ana kadar hiç gerçek Supabase kimlik bilgisiyle build edilmedi; böyle bir hata alırsan raporunda belirt, DONE_WITH_CONCERNS olarak işaretle, bu blocker değildir çünkü kullanıcı henüz gerçek env değişkenlerini ayarlamadı).

- [ ] **Step 9: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS, hiçbir regresyon yok.

- [ ] **Step 10: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/app/page.tsx src/app/page.module.css src/app/league-match-list.tsx src/app/league-match-list.module.css
git commit -m "feat: ana sayfa - lig checkbox filtresi ve mac listesi"
```

---

### Task 6: Maç detay sayfası — istatistik, oran, grafik, AI analizi

**Files:**
- Create: `src/app/matches/[id]/page.tsx`
- Create: `src/app/matches/[id]/page.module.css`
- Create: `src/app/matches/[id]/odds-chart-view.tsx`

**Interfaces:**
- Consumes: `getMatchById`, `DisplayMatch` (Task 1); `getLeagueById`, `DisplayLeague` (Task 1); `getLatestTeamStats`, `LatestTeamStats` (mevcut, Plan 3); `getLatestOdds`, `LatestOddsQuote`, `getOddsHistory`, `OddsHistoryPoint` (Task 2, mevcut); `getLatestAnalysis`, `LatestAnalysis` (Task 2); `buildOddsChartSeries` (Task 4); `formatKickoffTime` (Task 5).
- Produces: bu görev, sayfayı manuel oran bölümü OLMADAN oluşturur — Task 7 bu dosyayı DÜZENLEYEREK manuel oran formunu ve karşılaştırmayı ekler.

- [ ] **Step 1: Grafik render bileşenini yaz**

```tsx
// src/app/matches/[id]/odds-chart-view.tsx
import { buildOddsChartSeries, type OddsHistoryPoint } from "@/lib/odds-chart";
import styles from "./page.module.css";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 100;
const SERIES_COLORS = ["#2563eb", "#6b7280", "#dc2626"];

export function OddsChartView({ history }: { history: OddsHistoryPoint[] }) {
  const series = buildOddsChartSeries(history, CHART_WIDTH, CHART_HEIGHT);

  if (series.length === 0) {
    return <p className={styles.noData}>Oran gecmisi verisi henuz yok.</p>;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height={CHART_HEIGHT}
        role="img"
        aria-label="Oran gecmisi grafigi"
      >
        {series.map((s, i) => (
          <polyline
            key={s.outcome}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
          />
        ))}
      </svg>
      <ul className={styles.chartLegend}>
        {series.map((s, i) => (
          <li key={s.outcome} style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
            {s.outcome}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Detay sayfasını yaz (Server Component)**

`params` Promise'tir ve `PageProps` yardımcı tipi KULLANILMAZ (bkz. Global Constraints). Maç bulunamazsa `notFound()` çağrılır.

```tsx
// src/app/matches/[id]/page.tsx
import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { getMatchById, getLeagueById } from "@/lib/db/matches";
import { getLatestTeamStats, type LatestTeamStats } from "@/lib/db/team-stats";
import { getLatestOdds } from "@/lib/db/odds";
import { getOddsHistory } from "@/lib/db/odds";
import { getLatestAnalysis } from "@/lib/db/ai-analyses";
import { formatKickoffTime } from "@/lib/format";
import { OddsChartView } from "./odds-chart-view";
import styles from "./page.module.css";

interface RecentMatchShape {
  opponent?: string;
  goalsFor?: number;
  goalsAgainst?: number;
  result?: string;
}

function renderTeamStats(label: string, stats: LatestTeamStats | undefined) {
  if (!stats) {
    return (
      <div className={styles.teamStats}>
        <h3>{label}</h3>
        <p className={styles.noData}>Bu takim icin istatistik verisi mevcut degil.</p>
      </div>
    );
  }

  const lastMatches = stats.lastMatches as RecentMatchShape[];

  return (
    <div className={styles.teamStats}>
      <h3>{label}</h3>
      <p>Son form: {stats.form || "bilinmiyor"}</p>
      <p>Sakatlik/cezali sayisi: {stats.injuries.length}</p>
      <p>Kart cezasi sayisi: {stats.cards.length}</p>
      {lastMatches.length > 0 ? (
        <ul className={styles.recentMatches}>
          {lastMatches.map((m, i) => (
            <li key={i}>
              {m.opponent ?? "?"}: {m.goalsFor ?? "?"}-{m.goalsAgainst ?? "?"} ({m.result ?? "?"})
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noData}>Son mac verisi mevcut degil.</p>
      )}
    </div>
  );
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = getSupabaseClient();
  const match = await getMatchById(supabase, id);
  if (!match) {
    notFound();
  }

  const [league, teamStats, latestOdds, oddsHistory, analysis] = await Promise.all([
    getLeagueById(supabase, match.leagueId),
    getLatestTeamStats(supabase, match.id),
    getLatestOdds(supabase, match.id),
    getOddsHistory(supabase, match.id),
    getLatestAnalysis(supabase, match.id),
  ]);

  const homeStats = teamStats.find((s) => s.team === "home");
  const awayStats = teamStats.find((s) => s.team === "away");

  return (
    <main className={styles.page}>
      <p className={styles.league}>{league ? `${league.name} (${league.country})` : ""}</p>
      <h1 className={styles.title}>
        {match.homeTeam} - {match.awayTeam}
      </h1>
      <p className={styles.kickoff}>{formatKickoffTime(match.kickoffAt)}</p>

      <section className={styles.section}>
        <h2>Takim Durumu</h2>
        <div className={styles.statsGrid}>
          {renderTeamStats(match.homeTeam, homeStats)}
          {renderTeamStats(match.awayTeam, awayStats)}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Guncel Referans Oran</h2>
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
        <OddsChartView history={oddsHistory} />
      </section>

      <section className={styles.section}>
        <h2>AI Analiz</h2>
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
    </main>
  );
}
```

- [ ] **Step 3: Stilleri yaz**

```css
/* src/app/matches/[id]/page.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 64px;
}

.league {
  font-size: 13px;
  opacity: 0.6;
}

.title {
  font-size: 24px;
  font-weight: 700;
}

.kickoff {
  font-size: 14px;
  opacity: 0.7;
  margin-bottom: 8px;
}

.section {
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  padding-top: 16px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.statsGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 480px) {
  .statsGrid {
    grid-template-columns: 1fr;
  }
}

.teamStats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.recentMatches {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  opacity: 0.85;
}

.oddsList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.chartLegend {
  list-style: none;
  display: flex;
  gap: 12px;
  font-size: 12px;
  margin-top: 4px;
}

.analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
}

.summary {
  font-weight: 600;
}

.noData {
  opacity: 0.6;
  font-size: 13px;
  font-style: italic;
}
```

- [ ] **Step 4: Derleme ve lint kontrolü**

Run: `npx tsc --noEmit`
Expected: Bilinen, ilgisiz `layout.tsx` `LayoutProps` hatası dışında yeni hata YOK.

Run: `npm run lint`
Expected: Yeni dosyalar icin hata yok.

Run: `npm run build`
Expected: Derleme başarılı (Supabase env eksikse Step 8'deki (Task 5) aynı not gecerli — blocker degil, raporda belirt).

- [ ] **Step 5: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS, hiçbir regresyon yok (bu görev yeni vitest testi eklemiyor, sadece UI dosyaları — spec §10 geregi).

- [ ] **Step 6: Commit**

```bash
git add "src/app/matches/[id]/page.tsx" "src/app/matches/[id]/page.module.css" "src/app/matches/[id]/odds-chart-view.tsx"
git commit -m "feat: mac detay sayfasi - istatistik, oran, grafik, ai analiz"
```

---

### Task 7: Manuel oran girişi ve referans oranla karşılaştırma

**Files:**
- Create: `src/lib/odds-comparison.ts`
- Test: `src/lib/odds-comparison.test.ts`
- Create: `src/app/matches/[id]/actions.ts`
- Create: `src/app/matches/[id]/manual-odds-form.tsx`
- Create: `src/app/matches/[id]/manual-odds-form.module.css`
- Modify: `src/app/matches/[id]/page.tsx` (manuel oran bölümü eklenir)
- Modify: `src/app/matches/[id]/page.module.css` (form/karşılaştırma stilleri eklenir)

**Interfaces:**
- Consumes: `averagePricesByOutcome` (Task 4, `src/lib/odds-chart.ts`); `insertManualOdds`, `getManualOddsForMatch`, `ManualOddsRecord` (Task 3, `src/lib/db/manual-odds.ts`); `getLatestOdds` (mevcut, Plan 3); `getSupabaseClient` (mevcut).
- Produces: `OddsComparison` tipi, `compareManualToReference(manualEntries, referenceByOutcome): OddsComparison[]` (`src/lib/odds-comparison.ts`) — sadece bu görev içinde kullanılır, başka görev tüketmez (son görev).

- [ ] **Step 1: Karşılaştırma fonksiyonu için başarısız testleri yaz**

```typescript
// src/lib/odds-comparison.test.ts
import { describe, it, expect } from "vitest";
import { compareManualToReference } from "./odds-comparison";

describe("compareManualToReference", () => {
  it("computes the absolute and percentage difference against the reference price", () => {
    const referenceByOutcome = new Map([["Arsenal", 1.9]]);
    const result = compareManualToReference([{ outcome: "Arsenal", price: 2.0 }], referenceByOutcome);

    expect(result).toEqual([
      {
        outcome: "Arsenal",
        manualPrice: 2.0,
        referencePrice: 1.9,
        diff: expect.closeTo(0.1, 5),
        diffPercent: expect.closeTo((0.1 / 1.9) * 100, 5),
      },
    ]);
  });

  it("skips entries with no matching reference price", () => {
    const referenceByOutcome = new Map([["Arsenal", 1.9]]);
    const result = compareManualToReference([{ outcome: "Draw", price: 3.4 }], referenceByOutcome);
    expect(result).toEqual([]);
  });

  it("returns an empty array for no manual entries", () => {
    const result = compareManualToReference([], new Map());
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/odds-comparison.test.ts`
Expected: FAIL — `Cannot find module './odds-comparison'`

- [ ] **Step 3: `compareManualToReference`'ı yaz**

```typescript
// src/lib/odds-comparison.ts
export interface OddsComparison {
  outcome: string;
  manualPrice: number;
  referencePrice: number;
  diff: number;
  diffPercent: number;
}

export function compareManualToReference(
  manualEntries: { outcome: string; price: number }[],
  referenceByOutcome: Map<string, number>,
): OddsComparison[] {
  const results: OddsComparison[] = [];
  for (const entry of manualEntries) {
    const referencePrice = referenceByOutcome.get(entry.outcome);
    if (referencePrice === undefined) continue;
    const diff = entry.price - referencePrice;
    const diffPercent = (diff / referencePrice) * 100;
    results.push({ outcome: entry.outcome, manualPrice: entry.price, referencePrice, diff, diffPercent });
  }
  return results;
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/odds-comparison.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Server Action'ı yaz**

`'use server'` direktifi olan dosyalar Vitest altında normal bir async fonksiyon gibi çalışır (direktif sadece Next'in derleme zamanı bundler'ı için anlamlıdır, Vitest'te etkisizdir) — ama bu görev için ayrı bir vitest dosyası YAZILMAYACAK (UI-bağımlı Server Action, spec §10 kapsamında manuel/build doğrulaması yeterli).

```typescript
// src/app/matches/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";
import { insertManualOdds } from "@/lib/db/manual-odds";

export interface ManualOddsFormState {
  error: string | null;
  success: boolean;
}

const INITIAL_MANUAL_ODDS_STATE: ManualOddsFormState = { error: null, success: false };

export { INITIAL_MANUAL_ODDS_STATE };

export async function submitManualOdds(
  matchId: string,
  homeOutcome: string,
  awayOutcome: string,
  _prevState: ManualOddsFormState,
  formData: FormData,
): Promise<ManualOddsFormState> {
  const enteredBy = String(formData.get("enteredBy") ?? "").trim();
  if (!enteredBy) {
    return { error: "Adinizi girin.", success: false };
  }

  const fields: { name: string; outcome: string }[] = [
    { name: "homePrice", outcome: homeOutcome },
    { name: "drawPrice", outcome: "Draw" },
    { name: "awayPrice", outcome: awayOutcome },
  ];

  const entries: { outcome: string; price: number }[] = [];
  for (const field of fields) {
    const raw = formData.get(field.name);
    if (raw === null || raw === "") continue;
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 1) {
      return { error: "Oranlar 1'den buyuk bir sayi olmalidir.", success: false };
    }
    entries.push({ outcome: field.outcome, price });
  }

  if (entries.length === 0) {
    return { error: "En az bir oran girin.", success: false };
  }

  const supabase = getSupabaseClient();
  for (const entry of entries) {
    await insertManualOdds(supabase, {
      match_id: matchId,
      entered_by: enteredBy,
      market: "h2h",
      outcome: entry.outcome,
      price: entry.price,
    });
  }

  revalidatePath("/matches/[id]", "page");
  return { error: null, success: true };
}
```

- [ ] **Step 6: Form bileşenini yaz (Client Component)**

```tsx
// src/app/matches/[id]/manual-odds-form.tsx
"use client";

import { useActionState } from "react";
import { submitManualOdds, type ManualOddsFormState } from "./actions";
import styles from "./manual-odds-form.module.css";

const initialState: ManualOddsFormState = { error: null, success: false };

export function ManualOddsForm({
  matchId,
  homeTeam,
  awayTeam,
}: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const action = submitManualOdds.bind(null, matchId, homeTeam, awayTeam);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <p className={styles.disclaimer}>
        Gordugunuz oran, uluslararasi referans oranla birebir ayni olmayabilir (bkz. yukaridaki fark tablosu).
      </p>
      <label className={styles.label}>
        Adiniz
        <input type="text" name="enteredBy" required className={styles.input} />
      </label>
      <label className={styles.label}>
        {homeTeam} kazanir
        <input type="number" step="0.01" min="1.01" name="homePrice" className={styles.input} />
      </label>
      <label className={styles.label}>
        Beraberlik
        <input type="number" step="0.01" min="1.01" name="drawPrice" className={styles.input} />
      </label>
      <label className={styles.label}>
        {awayTeam} kazanir
        <input type="number" step="0.01" min="1.01" name="awayPrice" className={styles.input} />
      </label>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state.success && <p className={styles.success}>Kaydedildi.</p>}
      <button type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Form stillerini yaz**

```css
/* src/app/matches/[id]/manual-odds-form.module.css */
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 320px;
}

.disclaimer {
  font-size: 12px;
  opacity: 0.7;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.input {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  background: transparent;
  color: inherit;
  font-size: 14px;
}

.error {
  color: #dc2626;
  font-size: 13px;
}

.success {
  color: #16a34a;
  font-size: 13px;
}

.submit {
  padding: 10px;
  border-radius: 6px;
  border: none;
  background: var(--foreground);
  color: var(--background);
  font-weight: 600;
  cursor: pointer;
}

.submit:disabled {
  opacity: 0.6;
  cursor: default;
}
```

- [ ] **Step 8: Detay sayfasına manuel oran bölümünü ekle**

`src/app/matches/[id]/page.tsx`'i düzenle: importlara ekle, veri çekme `Promise.all`'a `getManualOddsForMatch` ekle, `averagePricesByOutcome`/`compareManualToReference` ile karşılaştırma hesapla, ve son bölüm olarak render et.

Importlara ekle:

```typescript
import { getManualOddsForMatch } from "@/lib/db/manual-odds";
import { averagePricesByOutcome } from "@/lib/odds-chart";
import { compareManualToReference } from "@/lib/odds-comparison";
import { ManualOddsForm } from "./manual-odds-form";
```

`Promise.all` dizisine `getManualOddsForMatch(supabase, match.id)` ekle ve sonucu `manualOdds` olarak adlandır (mevcut 5 elemanlı destructuring'i 6 elemanlıya genişlet: `[league, teamStats, latestOdds, oddsHistory, analysis, manualOdds]`).

`return` bloğundaki son `</section>`'dan sonra, `</main>`'den önce ekle:

```tsx
      <section className={styles.section}>
        <h2>Manuel Oran Karsilastirma</h2>
        {manualOdds.length > 0 && (
          <ul className={styles.oddsList}>
            {compareManualToReference(
              manualOdds.map((m) => ({ outcome: m.outcome, price: m.price })),
              averagePricesByOutcome(latestOdds),
            ).map((c) => (
              <li key={c.outcome}>
                {c.outcome}: siz {c.manualPrice}, referans {c.referencePrice.toFixed(2)} (fark{" "}
                {c.diffPercent > 0 ? "+" : ""}
                {c.diffPercent.toFixed(1)}%)
              </li>
            ))}
          </ul>
        )}
        <ManualOddsForm matchId={match.id} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
      </section>
```

- [ ] **Step 9: Derleme ve lint kontrolü**

Run: `npx tsc --noEmit`
Expected: Bilinen, ilgisiz `layout.tsx` `LayoutProps` hatası dışında yeni hata YOK.

Run: `npm run lint`
Expected: Yeni/değişen dosyalar için hata yok.

Run: `npm run build`
Expected: Derleme başarılı (Supabase env eksikse aynı not geçerli — blocker değil, raporda belirt).

- [ ] **Step 10: Tam test paketini çalıştır**

Run: `npx vitest run`
Expected: PASS (eskiler + yeni 3 test), hiçbir regresyon yok.

- [ ] **Step 11: Commit**

```bash
git add src/lib/odds-comparison.ts src/lib/odds-comparison.test.ts "src/app/matches/[id]/actions.ts" "src/app/matches/[id]/manual-odds-form.tsx" "src/app/matches/[id]/manual-odds-form.module.css" "src/app/matches/[id]/page.tsx" "src/app/matches/[id]/page.module.css"
git commit -m "feat: manuel oran girisi ve referans oranla karsilastirma"
```

---

## Task Sonrası: Kontrolcü Oturumunun Yapması Gereken (bu planın bir görevi değil)

Spec §10 UI akışının manuel/entegrasyon testiyle doğrulanmasını istiyor. Tüm 7 görev tamamlandıktan ve final review temiz çıktıktan sonra, branch'i `master`'a merge etmeden ÖNCE:
1. `npm run dev` ile geliştirme sunucusunu başlat.
2. Tarayıcıda ana sayfayı aç: lig checkbox'larının maç listesini filtrelediğini doğrula.
3. Bir maça tıkla: detay sayfasının açıldığını, veri yoksa "veri mevcut değil" mesajlarının (istatistik/oran/analiz için) düzgün göründüğünü doğrula (gerçek Supabase verisi olmadığından TÜM bölümler muhtemelen "veri yok" gösterecek — bu BEKLENEN bir durumdur, kullanıcı henüz manuel setup adımlarını yapmadı; asıl kontrol edilecek şey sayfanın KIRILMAMASI).
4. Manuel oran formunu bir isim + en az bir oran ile gönder, "Kaydedildi" mesajının göründüğünü ve sayfanın yeniden render edildiğini doğrula.
5. Konsol/network sekmesinde beklenmeyen hata olmadığını doğrula.

## Task Sonrası: Kullanıcının Yapması Gereken Manuel Adımlar (kod değil)

- Gerçek Supabase projesine SQL migration'ları uygulamak (henüz yapılmadıysa).
- `.env.local` ve Vercel'e tüm API anahtarlarını eklemek (henüz yapılmadıysa).
- Gerçek veri akışını görmek için `npm run seed:leagues` + GitHub Actions senkron job'larını en az bir kez çalıştırmak.
