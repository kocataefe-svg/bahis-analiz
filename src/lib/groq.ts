import { buildTeamAndCommentaryPrompt, type AnalysisPromptInput } from "./analysis-prompt";
import { normalizePersonaPick, type RawPersonaPick } from "./persona-pick";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-20b";

/** Takim Analizcisi + Yorumcu + ozet - "cekirdek" iki persona (bkz. analysis-prompt.ts). */
export interface TeamAndCommentaryResult {
  teamAnalystText: string;
  commentatorText: string;
  summaryText: string;
  teamAnalystPick: RawPersonaPick | null;
  commentatorPick: RawPersonaPick | null;
}

interface RawAnalysisJson {
  team_analyst_text?: string;
  commentator_text?: string;
  summary_text?: string;
  team_analyst_pick?: unknown;
  commentator_pick?: unknown;
}

function getApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

const RETRY_AFTER_PATTERN = /try again in ([\d.]+)s/i;
const MAX_RETRY_WAIT_MS = 8000;
const FALLBACK_RETRY_WAIT_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryWaitMs(errorBody: string): number {
  const match = errorBody.match(RETRY_AFTER_PATTERN);
  if (!match) return FALLBACK_RETRY_WAIT_MS;
  const seconds = parseFloat(match[1]);
  if (Number.isNaN(seconds)) return FALLBACK_RETRY_WAIT_MS;
  return Math.min(Math.ceil(seconds * 1000) + 250, MAX_RETRY_WAIT_MS);
}

async function callGroqOnce(
  apiKey: string,
  prompt: string,
  options?: { jsonMode?: boolean; maxTokens?: number },
): Promise<{ ok: true; content: string } | { ok: false; status: number; body: string }> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      ...(options?.jsonMode === false ? {} : { response_format: { type: "json_object" } }),
      // gpt-oss reasoning modelidir; varsayilan max_completion_tokens (1024)
      // gizli "reasoning" tokenlarina gidip govde bitmeden kesilebiliyor
      // (canli testte gorulen bir hata). Dusuk reasoning + makul token payi
      // bu riski azaltir - gorev derin akil yurutme gerektirmiyor. Cok
      // yuksek tutmuyoruz cunku Groq'un dakikalik (TPM) limiti bu degeri
      // rezerve ediyor - buyutmek art arda cagrilarda 429'u hizlandirir.
      reasoning_effort: "low",
      max_completion_tokens: options?.maxTokens ?? 1500,
    }),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false, status: res.status, body: "bos yanit (content yok)" };
  }
  return { ok: true, content };
}

export async function generateMatchAnalysis(input: AnalysisPromptInput): Promise<TeamAndCommentaryResult | null> {
  const apiKey = getApiKey();
  const prompt = buildTeamAndCommentaryPrompt(input);

  let outputText: string;
  try {
    let result = await callGroqOnce(apiKey, prompt);

    // Free tier TPM (dakikalik token) limitine takilmak art arda cok mac
    // islerken beklenen bir durum - Groq'un bildirdigi bekleme suresi
    // kadar durup TEK seferlik tekrar dener, sonra pes eder (bir sonraki
    // gunluk cron zaten tekrar dener).
    if (!result.ok && result.status === 429) {
      await sleep(parseRetryWaitMs(result.body));
      result = await callGroqOnce(apiKey, prompt);
    }

    if (!result.ok) {
      console.warn(`Groq analiz uretimi basarisiz (API hatasi): ${result.status} ${result.body}`);
      return null;
    }
    outputText = result.content;
  } catch (err) {
    console.warn("Groq analiz uretimi basarisiz (ag hatasi):", err);
    return null;
  }

  let parsed: RawAnalysisJson;
  try {
    parsed = JSON.parse(outputText) as RawAnalysisJson;
  } catch (err) {
    console.warn("Groq yaniti gecerli JSON degil:", err);
    return null;
  }

  if (!parsed.team_analyst_text || !parsed.commentator_text || !parsed.summary_text) {
    console.warn("Groq yaniti eksik alan iceriyor");
    return null;
  }

  return {
    teamAnalystText: parsed.team_analyst_text,
    commentatorText: parsed.commentator_text,
    summaryText: parsed.summary_text,
    teamAnalystPick: normalizePersonaPick(parsed.team_analyst_pick),
    commentatorPick: normalizePersonaPick(parsed.commentator_pick),
  };
}

/**
 * generateMatchAnalysis'ten farkli olarak duz metin (JSON degil) uretir -
 * Arastir ozelliginin Tavily arama sonuclarindan Turkce rapor yazdirmasi
 * icin kullanilir (bkz. web-research.ts).
 */
export async function generateGroqText(prompt: string, maxTokens = 1500): Promise<string | null> {
  const apiKey = getApiKey();

  try {
    let result = await callGroqOnce(apiKey, prompt, { jsonMode: false, maxTokens });

    if (!result.ok && result.status === 429) {
      await sleep(parseRetryWaitMs(result.body));
      result = await callGroqOnce(apiKey, prompt, { jsonMode: false, maxTokens });
    }

    if (!result.ok) {
      console.warn(`Groq metin uretimi basarisiz (API hatasi): ${result.status} ${result.body}`);
      return null;
    }
    return result.content;
  } catch (err) {
    console.warn("Groq metin uretimi basarisiz (ag hatasi):", err);
    return null;
  }
}
