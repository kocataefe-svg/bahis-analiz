# AI Analiz (Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her maç için üç persona (Takım Analizcisi, Bahis Analizcisi, Yorumcu) + özet metni üreten, mevcut istatistik/oran verisiyle beslenen ve Gemini API ile üretilip veritabanına önbelleklenen bir AI analiz senkronizasyon rotası eklemek.

**Architecture:** Mevcut sync-route deseninin (auth kontrolü → item bazlı try/catch → `{ok, ...counts}` yanıtı) dördüncü örneği. Yeni bir `/api/sync/analysis` rotası, yaklaşan maçlar için en güncel `team_stats_snapshots`/`odds_snapshots` verisini okur, en son üretilmiş analizden daha yeni veri varsa (veya hiç analiz yoksa) Gemini'ye prompt gönderir, yapılandırılmış JSON yanıtı `ai_analyses` tablosuna yazar. Veri eksikse (istatistik veya oran yok) prompt bunu açıkça belirtir, analiz yine de üretilir.

**Tech Stack:** `@google/genai` (Node SDK, `ai.interactions.create()` + `response_format`/`schema` ile yapılandırılmış JSON çıktı), model `gemini-3.5-flash-lite`, mevcut Next.js App Router + Supabase yığını.

**Spec:** [docs/superpowers/specs/2026-09-08-bahis-analiz-app-design.md](../specs/2026-09-08-bahis-analiz-app-design.md) (§3 Gemini model seçimi, §5 3-persona akışı, §6 `ai_analyses` tablosu, §7 hata yönetimi)

## Global Constraints

- Model: `gemini-3.5-flash-lite` (spec §3 — `gemini-2.5-flash-lite` Ekim 2026'da emekli oluyor, bu yüzden değiştirildi).
- Gemini SDK yüzeyi: `ai.interactions.create({ model, input, response_format: { type: "text", mime_type: "application/json", schema } })`, yanıt `interaction.output_text` alanında JSON string olarak gelir (spec §3).
- Ücretsiz kota: Gemini 1500 istek/gün, 30 istek/dk — bu plandaki senkron rotası günde en fazla 2 kez tetiklenecek ve çalıştırma başına en fazla 15 maçla sınırlı olacak (final review sonrası Vercel Hobby serverless zaman aşımı riskini azaltmak ve `stats` senkron penceresiyle hizalanmak için 80'den düşürüldü, bkz. Task 5), yani en kötü senaryoda 30 istek/gün — kotanın çok altında.
- Eksik veri asla hataya yol açmaz: istatistik veya oran verisi yoksa analiz "bu veri mevcut değil" diyerek üretilmeye devam eder (spec §3, §7). Hiçbir görev bir maçta veri olacağını varsaymaz.
- Analiz sonucu önbelleklenir: kullanıcı sayfa açtığında yeniden üretilmez, sadece senkron job'da üretilip DB'ye yazılır (spec §2).
- API anahtarları sunucu tarafı env variable'dır, client'a gönderilmez (spec §8). `GEMINI_API_KEY` zaten `.env.local.example`'da mevcut.
- Test yaklaşımı: Gemini istemcisi mock'lanır, üretilen çıktının 3 persona + özet alanlarını içerdiği (yapı, içerik değil) doğrulanır (spec §10).
- Tüm yeni dosyalar mevcut kod tabanı konvansiyonlarını izler: `SupabaseClient` parametresi alan DB yardımcıları, Türkçe hata mesajları (`throw new Error(...)`), ağ/HTTP hatalarında `console.warn` ile loglayıp güvenli fallback döndüren istemciler, item-bazlı try/catch içeren sync route'ları.

---

## Mevcut Kod Tabanı Referansları (yeni kod bunlarla tutarlı olmalı)

- `src/lib/db/matches.ts` → `getUpcomingMatches(supabase, withinDays, limit): Promise<SyncMatch[]>` — `SyncMatch = { id, apiFixtureId, homeTeam, awayTeam, homeTeamApiId, awayTeamApiId, kickoffAt }`.
- `src/lib/sync-auth.ts` → `isSyncRequestAuthorized(request: Request): boolean`.
- `src/lib/supabase.ts` → `getSupabaseClient(): SupabaseClient`.
- `src/app/api/sync/odds/route.ts` — item-bazlı try/catch + sayaç deseni örneği.
- Migration `supabase/migrations/0001_init.sql` — `ai_analyses` tablosu zaten mevcut: `id, match_id, team_analyst_text, betting_analyst_text, commentator_text, summary_text, model_used, generated_at`. **Yeni migration gerekmiyor.**
- Migration `supabase/migrations/0002_data_ingestion.sql` — `team_stats_snapshots` tablosunda `team, form, injuries(jsonb), cards(jsonb), last_matches(jsonb), stats(jsonb), fetched_at` kolonları var. `stats` kolonu şu an hiçbir yerde doldurulmuyor (her zaman `{}`), bu yüzden bu planda okunmuyor.

---

### Task 1: Prompt oluşturma modülü

**Files:**
- Create: `src/lib/analysis-prompt.ts`
- Test: `src/lib/analysis-prompt.test.ts`

**Interfaces:**
- Consumes: yok (saf fonksiyon, dış bağımlılık yok).
- Produces: `TeamStatsForPrompt`, `OddsForPrompt`, `AnalysisPromptInput` tipleri ve `buildAnalysisPrompt(input: AnalysisPromptInput): string` — Task 2 (`gemini.ts`) ve Task 5 (route) bu tipleri ve fonksiyonu kullanır.

- [ ] **Step 1: Başarısız testleri yaz**

```typescript
// src/lib/analysis-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt } from "./analysis-prompt";

const baseInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  homeStats: null,
  awayStats: null,
  odds: [],
};

describe("buildAnalysisPrompt", () => {
  it("includes both team names and kickoff time", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Arsenal");
    expect(prompt).toContain("Chelsea");
    expect(prompt).toContain("2026-09-20T15:00:00Z");
  });

  it("asks for all three personas and a summary field", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Takim Analizcisi");
    expect(prompt).toContain("Bahis Analizcisi");
    expect(prompt).toContain("Yorumcu");
    expect(prompt).toContain("summary_text");
  });

  it("marks missing home/away stats explicitly instead of omitting them", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("istatistik verisi mevcut degil");
  });

  it("includes form/injury/card counts when stats are present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      homeStats: {
        form: "WWDLW",
        injuries: [{ player: "X" }],
        cards: [{ player: "Y" }],
        lastMatches: [{ opponent: "Everton", goalsFor: 2, goalsAgainst: 1, result: "W" }],
      },
    });
    expect(prompt).toContain("WWDLW");
    expect(prompt).toContain("Sakatlik/cezali sayisi: 1");
    expect(prompt).toContain("Kart cezasi sayisi: 1");
    expect(prompt).toContain("Everton");
  });

  it("marks missing odds explicitly and warns against value-bet commentary", () => {
    const prompt = buildAnalysisPrompt(baseInput);
    expect(prompt).toContain("Oran verisi mevcut degil");
  });

  it("includes bookmaker/outcome/price when odds are present", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      odds: [{ bookmaker: "pinnacle", outcome: "Arsenal", price: 1.8 }],
    });
    expect(prompt).toContain("pinnacle");
    expect(prompt).toContain("Arsenal");
    expect(prompt).toContain("1.8");
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/analysis-prompt.test.ts`
Expected: FAIL — `Cannot find module './analysis-prompt'`

- [ ] **Step 3: Minimal implementasyonu yaz**

```typescript
// src/lib/analysis-prompt.ts
export interface TeamStatsForPrompt {
  form: string | null;
  injuries: unknown[];
  cards: unknown[];
  lastMatches: unknown[];
}

export interface OddsForPrompt {
  bookmaker: string;
  outcome: string;
  price: number;
}

export interface AnalysisPromptInput {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeStats: TeamStatsForPrompt | null;
  awayStats: TeamStatsForPrompt | null;
  odds: OddsForPrompt[];
}

function formatTeamStats(label: string, stats: TeamStatsForPrompt | null): string {
  if (!stats) {
    return `${label}: Bu takim icin istatistik verisi mevcut degil. Bu durumu belirt ve temkinli yorum yap.`;
  }
  return [
    `${label}:`,
    `- Son form: ${stats.form || "bilinmiyor"}`,
    `- Sakatlik/cezali sayisi: ${stats.injuries.length}`,
    `- Kart cezasi sayisi: ${stats.cards.length}`,
    `- Son maclar: ${JSON.stringify(stats.lastMatches)}`,
  ].join("\n");
}

function formatOdds(odds: OddsForPrompt[]): string {
  if (odds.length === 0) {
    return "Oran verisi mevcut degil. Oran bazli yorum (value bet vs.) yapma, sadece takim/istatistik yorumuna odaklan.";
  }
  return [
    "Guncel referans oranlar (uluslararasi bookmaker, Iddaa/Nesine ile birebir ayni degil):",
    ...odds.map((o) => `- ${o.bookmaker}: ${o.outcome} @ ${o.price}`),
  ].join("\n");
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  return [
    "Sen bir futbol bahis analiz ekibisin. Asagidaki mac icin uc ayri persona olarak Turkce yorum uret:",
    "1. Takim Analizcisi: form, sakatlik, kart cezasi, onemli anlar (orn. play-off/sampiyonluk icin 3 puan gerekliligi) uzerinden yorum.",
    "2. Bahis Analizcisi: istatistik + oran okumasi, value degerlendirmesi (oran varsa).",
    "3. Yorumcu: genel mac yorumu ve tahmini.",
    "Ayrica kisa bir summary_text ozet alani uret.",
    "",
    `Mac: ${input.homeTeam} - ${input.awayTeam}, ${input.kickoffAt}`,
    "",
    formatTeamStats(`Ev sahibi (${input.homeTeam})`, input.homeStats),
    "",
    formatTeamStats(`Deplasman (${input.awayTeam})`, input.awayStats),
    "",
    formatOdds(input.odds),
    "",
    "Eksik veri varsa bunu acikca belirt, veri yokmus gibi davranma veya uydurma.",
  ].join("\n");
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/analysis-prompt.test.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis-prompt.ts src/lib/analysis-prompt.test.ts
git commit -m "feat: gemini analiz prompt olusturma modulu"
```

---

### Task 2: Gemini istemcisi

**Files:**
- Modify: `package.json` (yeni bağımlılık ekle)
- Create: `src/lib/gemini.ts`
- Test: `src/lib/gemini.test.ts`

**Interfaces:**
- Consumes: `AnalysisPromptInput`, `buildAnalysisPrompt` (Task 1, `src/lib/analysis-prompt.ts`).
- Produces: `GEMINI_MODEL: string` sabiti ve `MatchAnalysisResult` tipi ve `generateMatchAnalysis(input: AnalysisPromptInput): Promise<MatchAnalysisResult | null>` — Task 5 (route) bunu kullanır.

- [ ] **Step 1: Bağımlılığı ekle**

```bash
npm install @google/genai@^2.22.0
```

- [ ] **Step 2: Başarısız testleri yaz**

```typescript
// src/lib/gemini.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    interactions: { create: mockCreate },
  })),
}));

import { generateMatchAnalysis, GEMINI_MODEL } from "./gemini";

const minimalInput = {
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  kickoffAt: "2026-09-20T15:00:00Z",
  homeStats: null,
  awayStats: null,
  odds: [],
};

function validAnalysisJson() {
  return JSON.stringify({
    team_analyst_text: "takim analizi",
    betting_analyst_text: "bahis analizi",
    commentator_text: "yorum",
    summary_text: "ozet",
  });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mockCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateMatchAnalysis", () => {
  it("calls the Gemini SDK with the configured model and returns parsed fields", async () => {
    mockCreate.mockResolvedValue({ output_text: validAnalysisJson() });

    const result = await generateMatchAnalysis(minimalInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: GEMINI_MODEL,
        input: expect.any(String),
      }),
    );
    expect(result).toEqual({
      teamAnalystText: "takim analizi",
      bettingAnalystText: "bahis analizi",
      commentatorText: "yorum",
      summaryText: "ozet",
    });
  });

  it("returns null when the SDK call throws (rate limit/network)", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response JSON is missing a required field", async () => {
    mockCreate.mockResolvedValue({ output_text: JSON.stringify({ team_analyst_text: "x" }) });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("returns null when the response is not valid JSON", async () => {
    mockCreate.mockResolvedValue({ output_text: "not json" });
    const result = await generateMatchAnalysis(minimalInput);
    expect(result).toBeNull();
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    await expect(generateMatchAnalysis(minimalInput)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/gemini.test.ts`
Expected: FAIL — `Cannot find module './gemini'`

- [ ] **Step 4: Minimal implementasyonu yaz**

```typescript
// src/lib/gemini.ts
import { GoogleGenAI } from "@google/genai";
import { buildAnalysisPrompt, type AnalysisPromptInput } from "./analysis-prompt";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface MatchAnalysisResult {
  teamAnalystText: string;
  bettingAnalystText: string;
  commentatorText: string;
  summaryText: string;
}

interface RawAnalysisJson {
  team_analyst_text?: string;
  betting_analyst_text?: string;
  commentator_text?: string;
  summary_text?: string;
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

const ANALYSIS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    team_analyst_text: { type: "string" },
    betting_analyst_text: { type: "string" },
    commentator_text: { type: "string" },
    summary_text: { type: "string" },
  },
  required: ["team_analyst_text", "betting_analyst_text", "commentator_text", "summary_text"],
};

export async function generateMatchAnalysis(input: AnalysisPromptInput): Promise<MatchAnalysisResult | null> {
  const apiKey = getApiKey();
  const prompt = buildAnalysisPrompt(input);

  let outputText: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: ANALYSIS_RESPONSE_SCHEMA,
      },
    });
    outputText = interaction.output_text;
  } catch (err) {
    console.warn("Gemini analiz uretimi basarisiz (API hatasi):", err);
    return null;
  }

  let parsed: RawAnalysisJson;
  try {
    parsed = JSON.parse(outputText) as RawAnalysisJson;
  } catch (err) {
    console.warn("Gemini yaniti gecerli JSON degil:", err);
    return null;
  }

  if (
    !parsed.team_analyst_text ||
    !parsed.betting_analyst_text ||
    !parsed.commentator_text ||
    !parsed.summary_text
  ) {
    console.warn("Gemini yaniti eksik alan iceriyor");
    return null;
  }

  return {
    teamAnalystText: parsed.team_analyst_text,
    bettingAnalystText: parsed.betting_analyst_text,
    commentatorText: parsed.commentator_text,
    summaryText: parsed.summary_text,
  };
}
```

- [ ] **Step 5: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/gemini.test.ts`
Expected: PASS (5 test)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/gemini.ts src/lib/gemini.test.ts
git commit -m "feat: gemini api istemcisi (yapilandirilmis json cikti)"
```

---

### Task 3: `ai_analyses` DB yardımcıları

**Files:**
- Create: `src/lib/db/ai-analyses.ts`
- Test: `src/lib/db/ai-analyses.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` (tip olarak, `@supabase/supabase-js`'den).
- Produces: `AiAnalysisInsertRow` tipi, `insertAiAnalysis(supabase, row): Promise<void>`, `getLatestAnalysisGeneratedAt(supabase, matchId): Promise<string | null>`, `needsFreshAnalysis(analysisGeneratedAt: string | null, latestDataFetchedAt: string | null): boolean` — Task 5 (route) hepsini kullanır.

- [ ] **Step 1: Başarısız testleri yaz**

```typescript
// src/lib/db/ai-analyses.test.ts
import { describe, it, expect, vi } from "vitest";
import { insertAiAnalysis, getLatestAnalysisGeneratedAt, needsFreshAnalysis } from "./ai-analyses";

describe("insertAiAnalysis", () => {
  it("inserts a row into ai_analyses", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const row = {
      match_id: "m1",
      team_analyst_text: "a",
      betting_analyst_text: "b",
      commentator_text: "c",
      summary_text: "d",
      model_used: "gemini-3.5-flash-lite",
    };

    await insertAiAnalysis({ from } as any, row);

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    await expect(
      insertAiAnalysis({ from } as any, {
        match_id: "m1",
        team_analyst_text: "a",
        betting_analyst_text: "b",
        commentator_text: "c",
        summary_text: "d",
        model_used: "gemini-3.5-flash-lite",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("getLatestAnalysisGeneratedAt", () => {
  it("returns the most recent generated_at for the match", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ generated_at: "2026-09-13T10:00:00Z" }], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysisGeneratedAt({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("ai_analyses");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toBe("2026-09-13T10:00:00Z");
  });

  it("returns null when no analysis exists yet", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestAnalysisGeneratedAt({ from } as any, "m1");
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestAnalysisGeneratedAt({ from } as any, "m1")).rejects.toThrow("boom");
  });
});

describe("needsFreshAnalysis", () => {
  it("is true when no analysis exists yet, regardless of data timestamp", () => {
    expect(needsFreshAnalysis(null, null)).toBe(true);
    expect(needsFreshAnalysis(null, "2026-09-13T10:00:00Z")).toBe(true);
  });

  it("is false when an analysis exists and there is no newer data", () => {
    expect(needsFreshAnalysis("2026-09-13T10:00:00Z", null)).toBe(false);
    expect(needsFreshAnalysis("2026-09-13T10:00:00Z", "2026-09-13T09:00:00Z")).toBe(false);
  });

  it("is true when the latest data is newer than the last analysis", () => {
    expect(needsFreshAnalysis("2026-09-13T10:00:00Z", "2026-09-13T11:00:00Z")).toBe(true);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/db/ai-analyses.test.ts`
Expected: FAIL — `Cannot find module './ai-analyses'`

- [ ] **Step 3: Minimal implementasyonu yaz**

```typescript
// src/lib/db/ai-analyses.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AiAnalysisInsertRow {
  match_id: string;
  team_analyst_text: string;
  betting_analyst_text: string;
  commentator_text: string;
  summary_text: string;
  model_used: string;
}

export async function insertAiAnalysis(supabase: SupabaseClient, row: AiAnalysisInsertRow): Promise<void> {
  const { error } = await supabase.from("ai_analyses").insert(row);
  if (error) throw new Error(`AI analizi kaydedilemedi: ${error.message}`);
}

export async function getLatestAnalysisGeneratedAt(supabase: SupabaseClient, matchId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_analyses")
    .select("generated_at")
    .eq("match_id", matchId)
    .order("generated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`AI analizi tarihi alinamadi: ${error.message}`);

  const rows = (data ?? []) as { generated_at: string }[];
  return rows[0]?.generated_at ?? null;
}

export function needsFreshAnalysis(analysisGeneratedAt: string | null, latestDataFetchedAt: string | null): boolean {
  if (!analysisGeneratedAt) return true;
  if (!latestDataFetchedAt) return false;
  return new Date(latestDataFetchedAt).getTime() > new Date(analysisGeneratedAt).getTime();
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/db/ai-analyses.test.ts`
Expected: PASS (8 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/ai-analyses.ts src/lib/db/ai-analyses.test.ts
git commit -m "feat: ai_analyses db yardimcilari ve tazelik kontrolu"
```

---

### Task 4: En güncel istatistik/oran okuma yardımcıları

**Files:**
- Modify: `src/lib/db/team-stats.ts`
- Modify: `src/lib/db/odds.ts`
- Modify: `src/lib/db/team-stats.test.ts`
- Modify: `src/lib/db/odds.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` tipi.
- Produces: `LatestTeamStats` tipi ve `getLatestTeamStats(supabase, matchId): Promise<LatestTeamStats[]>` (`src/lib/db/team-stats.ts`); `LatestOddsQuote` tipi ve `getLatestOdds(supabase, matchId): Promise<LatestOddsQuote[]>` (`src/lib/db/odds.ts`) — ikisi de Task 5 (route) tarafından kullanılır ve alan adları Task 1'in `TeamStatsForPrompt`/`OddsForPrompt` tiplerine (route içinde) eşlenir.

- [ ] **Step 1: Başarısız testleri ekle (team-stats)**

`src/lib/db/team-stats.test.ts` dosyasının sonuna ekle:

```typescript
import { getLatestTeamStats } from "./team-stats";

describe("getLatestTeamStats", () => {
  it("returns the most recent snapshot per team, newest first per team", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { team: "home", form: "WWDLW", injuries: [], cards: [], last_matches: [], fetched_at: "2026-09-13T12:00:00Z" },
        { team: "away", form: "LLDWW", injuries: [{ p: 1 }], cards: [], last_matches: [], fetched_at: "2026-09-13T11:00:00Z" },
        { team: "home", form: "OLD", injuries: [], cards: [], last_matches: [], fetched_at: "2026-09-12T12:00:00Z" },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestTeamStats({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("team_stats_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual([
      { team: "home", form: "WWDLW", injuries: [], cards: [], lastMatches: [], fetchedAt: "2026-09-13T12:00:00Z" },
      { team: "away", form: "LLDWW", injuries: [{ p: 1 }], cards: [], lastMatches: [], fetchedAt: "2026-09-13T11:00:00Z" },
    ]);
  });

  it("returns an empty array when no snapshots exist", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestTeamStats({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestTeamStats({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Başarısız testleri ekle (odds)**

`src/lib/db/odds.test.ts` dosyasının sonuna ekle:

```typescript
import { getLatestOdds } from "./odds";

describe("getLatestOdds", () => {
  it("returns only the rows from the most recent fetch batch", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetched_at: "2026-09-13T12:00:00Z" },
        { outcome: "Draw", bookmaker: "pinnacle", price: 3.6, fetched_at: "2026-09-13T12:00:00Z" },
        { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.9, fetched_at: "2026-09-12T12:00:00Z" },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");

    expect(from).toHaveBeenCalledWith("odds_snapshots");
    expect(eq).toHaveBeenCalledWith("match_id", "m1");
    expect(result).toEqual([
      { outcome: "Arsenal", bookmaker: "pinnacle", price: 1.8, fetchedAt: "2026-09-13T12:00:00Z" },
      { outcome: "Draw", bookmaker: "pinnacle", price: 3.6, fetchedAt: "2026-09-13T12:00:00Z" },
    ]);
  });

  it("returns an empty array when no odds snapshots exist", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await getLatestOdds({ from } as any, "m1");
    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(getLatestOdds({ from } as any, "m1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run src/lib/db/team-stats.test.ts src/lib/db/odds.test.ts`
Expected: FAIL — `getLatestTeamStats`/`getLatestOdds` export edilmiyor

- [ ] **Step 4: `getLatestTeamStats`'i `team-stats.ts`'e ekle**

`src/lib/db/team-stats.ts` dosyasının sonuna ekle:

```typescript
export interface LatestTeamStats {
  team: "home" | "away";
  form: string | null;
  injuries: unknown[];
  cards: unknown[];
  lastMatches: unknown[];
  fetchedAt: string;
}

export async function getLatestTeamStats(supabase: SupabaseClient, matchId: string): Promise<LatestTeamStats[]> {
  const { data, error } = await supabase
    .from("team_stats_snapshots")
    .select("team, form, injuries, cards, last_matches, fetched_at")
    .eq("match_id", matchId)
    .order("fetched_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`Takim istatistikleri alinamadi: ${error.message}`);

  interface RawRow {
    team: "home" | "away";
    form: string | null;
    injuries: unknown[];
    cards: unknown[];
    last_matches: unknown[];
    fetched_at: string;
  }

  const seenTeams = new Set<string>();
  const latest: LatestTeamStats[] = [];
  for (const row of (data ?? []) as RawRow[]) {
    if (seenTeams.has(row.team)) continue;
    seenTeams.add(row.team);
    latest.push({
      team: row.team,
      form: row.form,
      injuries: row.injuries,
      cards: row.cards,
      lastMatches: row.last_matches,
      fetchedAt: row.fetched_at,
    });
  }
  return latest;
}
```

- [ ] **Step 5: `getLatestOdds`'u `odds.ts`'e ekle**

`src/lib/db/odds.ts` dosyasının sonuna ekle:

```typescript
export interface LatestOddsQuote {
  outcome: string;
  bookmaker: string;
  price: number;
  fetchedAt: string;
}

export async function getLatestOdds(supabase: SupabaseClient, matchId: string): Promise<LatestOddsQuote[]> {
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("outcome, bookmaker, price, fetched_at")
    .eq("match_id", matchId)
    .order("fetched_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Oranlar alinamadi: ${error.message}`);

  interface RawRow {
    outcome: string;
    bookmaker: string;
    price: number;
    fetched_at: string;
  }

  const rows = (data ?? []) as RawRow[];
  if (rows.length === 0) return [];

  const latestFetchedAt = rows[0].fetched_at;
  return rows
    .filter((r) => r.fetched_at === latestFetchedAt)
    .map((r) => ({ outcome: r.outcome, bookmaker: r.bookmaker, price: r.price, fetchedAt: r.fetched_at }));
}
```

Not: `odds.ts` zaten `import type { SupabaseClient } from "@supabase/supabase-js";` satırına sahip, tekrar eklemeye gerek yok.

- [ ] **Step 6: Testlerin geçtiğini doğrula**

Run: `npx vitest run src/lib/db/team-stats.test.ts src/lib/db/odds.test.ts`
Expected: PASS (tüm testler — eskiler + yeni 6 test)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/team-stats.ts src/lib/db/odds.ts src/lib/db/team-stats.test.ts src/lib/db/odds.test.ts
git commit -m "feat: en guncel takim istatistigi ve oran okuma yardimcilari"
```

---

### Task 5: `/api/sync/analysis` rotası

**Files:**
- Create: `src/app/api/sync/analysis/route.ts`
- Test: `src/app/api/sync/analysis/route.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient` (`@/lib/supabase`), `getUpcomingMatches`/`SyncMatch` (`@/lib/db/matches`), `getLatestTeamStats`/`LatestTeamStats` (`@/lib/db/team-stats`, Task 4), `getLatestOdds`/`LatestOddsQuote` (`@/lib/db/odds`, Task 4), `insertAiAnalysis`/`getLatestAnalysisGeneratedAt`/`needsFreshAnalysis` (`@/lib/db/ai-analyses`, Task 3), `generateMatchAnalysis`/`GEMINI_MODEL` (`@/lib/gemini`, Task 2), `isSyncRequestAuthorized` (`@/lib/sync-auth`).
- Produces: `POST` handler döndürüyor `{ ok: true, generated: number, skipped: number, failed: number }` — Task 6 (GitHub Actions) bu rotayı tetikler.

- [ ] **Step 1: Başarısız testleri yaz**

```typescript
// src/app/api/sync/analysis/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/db/matches", () => ({ getUpcomingMatches: vi.fn() }));
vi.mock("@/lib/db/team-stats", () => ({ getLatestTeamStats: vi.fn() }));
vi.mock("@/lib/db/odds", () => ({ getLatestOdds: vi.fn() }));
vi.mock("@/lib/db/ai-analyses", () => ({
  getLatestAnalysisGeneratedAt: vi.fn(),
  needsFreshAnalysis: vi.fn(),
  insertAiAnalysis: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({ generateMatchAnalysis: vi.fn(), GEMINI_MODEL: "gemini-3.5-flash-lite" }));

import { POST } from "./route";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestTeamStats } from "@/lib/db/team-stats";
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
  apiFixtureId: 1001,
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  homeTeamApiId: 1,
  awayTeamApiId: 2,
  kickoffAt: "2026-09-20T15:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(getUpcomingMatches).mockReset();
  vi.mocked(getLatestTeamStats).mockReset().mockResolvedValue([]);
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
    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ homeTeam: "Arsenal", awayTeam: "Chelsea" }),
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
    vi.mocked(getLatestTeamStats).mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([]);

    const res = await POST(makeRequest("Bearer test-secret") as any);
    const body = await res.json();

    expect(body).toEqual({ ok: true, generated: 1, skipped: 0, failed: 1 });
  });

  it("passes missing stats/odds through as null/empty so the prompt marks them as unavailable", async () => {
    vi.mocked(getUpcomingMatches).mockResolvedValue([match]);
    vi.mocked(getLatestTeamStats).mockResolvedValue([]);
    vi.mocked(getLatestOdds).mockResolvedValue([]);

    await POST(makeRequest("Bearer test-secret") as any);

    expect(generateMatchAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ homeStats: null, awayStats: null, odds: [] }),
    );
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run src/app/api/sync/analysis/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Minimal implementasyonu yaz**

```typescript
// src/app/api/sync/analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getUpcomingMatches } from "@/lib/db/matches";
import { getLatestTeamStats } from "@/lib/db/team-stats";
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
      const [teamStats, odds, latestAnalysisAt] = await Promise.all([
        getLatestTeamStats(supabase, match.id),
        getLatestOdds(supabase, match.id),
        getLatestAnalysisGeneratedAt(supabase, match.id),
      ]);

      const homeStats = teamStats.find((s) => s.team === "home") ?? null;
      const awayStats = teamStats.find((s) => s.team === "away") ?? null;

      const dataTimestamps = [homeStats?.fetchedAt, awayStats?.fetchedAt, odds[0]?.fetchedAt].filter(
        (v): v is string => Boolean(v),
      );
      const latestDataFetchedAt =
        dataTimestamps.length > 0
          ? dataTimestamps.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
          : null;

      if (!needsFreshAnalysis(latestAnalysisAt, latestDataFetchedAt)) {
        skipped += 1;
        continue;
      }

      const result = await generateMatchAnalysis({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: match.kickoffAt,
        homeStats: homeStats
          ? { form: homeStats.form, injuries: homeStats.injuries, cards: homeStats.cards, lastMatches: homeStats.lastMatches }
          : null,
        awayStats: awayStats
          ? { form: awayStats.form, injuries: awayStats.injuries, cards: awayStats.cards, lastMatches: awayStats.lastMatches }
          : null,
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

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npx vitest run src/app/api/sync/analysis/route.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sync/analysis/route.ts src/app/api/sync/analysis/route.test.ts
git commit -m "feat: ai analiz senkronizasyon route'u"
```

---

### Task 6: GitHub Actions zamanlaması

**Files:**
- Modify: `.github/workflows/sync.yml`

**Interfaces:**
- Consumes: `/api/sync/analysis` rotası (Task 5), mevcut `secrets.APP_BASE_URL` ve `secrets.CRON_SECRET`.
- Produces: yok (son görev, kod tüketen başka görev yok).

- [ ] **Step 1: Yeni cron tetikleyicisini ve job'u ekle**

`.github/workflows/sync.yml` dosyasını şu hale getir (mevcut `on.schedule` listesine bir satır, mevcut `jobs`'a bir job eklenir):

```yaml
name: Veri Senkronizasyonu

on:
  schedule:
    - cron: "0 6 * * *"
    - cron: "0 18 * * *"
    - cron: "30 6 * * *"
    - cron: "0 8 * * *"
    - cron: "0 9 * * *"
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

  sync-analysis:
    if: github.event.schedule == '0 9 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger AI analiz senkronizasyonu
        run: |
          curl -sf -X POST "${{ secrets.APP_BASE_URL }}/api/sync/analysis" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

`sync-analysis` job'u, oran senkronundan (08:00 UTC) bir saat sonra (09:00 UTC) çalışacak şekilde zamanlandı — böylece o günkü en güncel oran/istatistik verisiyle analiz üretilir.

- [ ] **Step 2: YAML'ın geçerli olduğunu doğrula**

Run: `npx yaml-lint .github/workflows/sync.yml 2>/dev/null || node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/sync.yml', 'utf8')); console.log('OK')" 2>/dev/null || echo "GitHub Actions'in kendi syntax kontrolu icin: git push sonrasi Actions sekmesinde workflow gorunur olmalidir"`
Expected: Dosya YAML olarak parse edilebilir olmalı (proje bir YAML parser bağımlılığı içermiyor; en güvenilir doğrulama, push sonrası GitHub Actions'ın workflow'u tanıyıp listelemesidir).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync.yml
git commit -m "feat: ai analiz senkronizasyonu icin github actions zamanlamasi"
```

---

## Task Sonrası: Kullanıcının Yapması Gereken Manuel Adımlar (kod değil)

Bu plan tamamlandıktan sonra, gerçek ortamda çalışması için:
1. `.env.local`'a ve Vercel proje ayarlarına `GEMINI_API_KEY` eklenmeli (Google AI Studio'dan alınır — `.env.local.example`'da alan zaten hazır).
2. Yeni migration yok — `ai_analyses` tablosu zaten Plan 1'in migration'ında var, tekrar SQL çalıştırmaya gerek yok.
3. GitHub Actions'ın `/api/sync/analysis`'i tetikleyebilmesi için ek bir repo secret'ı gerekmiyor (mevcut `APP_BASE_URL`/`CRON_SECRET` yeterli).
4. İsteğe bağlı doğrulama: `workflow_dispatch` ile Actions sekmesinden `sync-analysis` job'unu manuel tetikleyip `ai_analyses` tablosuna satır düştüğünü Supabase'den kontrol etmek.
