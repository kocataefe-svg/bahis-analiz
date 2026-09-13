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
    if (!interaction.output_text) {
      console.warn("Gemini yaniti bos (output_text yok)");
      return null;
    }
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
