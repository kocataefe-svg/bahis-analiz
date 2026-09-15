import { buildAnalysisPrompt, type AnalysisPromptInput } from "./analysis-prompt";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-20b";

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
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY env degiskeni tanimli degil");
  }
  return key;
}

const JSON_FORMAT_INSTRUCTION = [
  "",
  "Yanitini SADECE gecerli bir JSON nesnesi olarak ver, baska hicbir metin ekleme (aciklama, markdown code fence vb. yok).",
  "JSON tam olarak su alanlari icermeli: team_analyst_text, betting_analyst_text, commentator_text, summary_text (hepsi string).",
].join("\n");

export async function generateMatchAnalysis(input: AnalysisPromptInput): Promise<MatchAnalysisResult | null> {
  const apiKey = getApiKey();
  const prompt = buildAnalysisPrompt(input) + JSON_FORMAT_INSTRUCTION;

  let outputText: string;
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.warn(`Groq analiz uretimi basarisiz (API hatasi): ${res.status} ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("Groq yaniti bos (content yok)");
      return null;
    }
    outputText = content;
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

  if (
    !parsed.team_analyst_text ||
    !parsed.betting_analyst_text ||
    !parsed.commentator_text ||
    !parsed.summary_text
  ) {
    console.warn("Groq yaniti eksik alan iceriyor");
    return null;
  }

  return {
    teamAnalystText: parsed.team_analyst_text,
    bettingAnalystText: parsed.betting_analyst_text,
    commentatorText: parsed.commentator_text,
    summaryText: parsed.summary_text,
  };
}
