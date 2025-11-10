import {
  flashModel,
  proModel,
  SYSTEM_INSTRUCTIONS,
  GENERATION_CONFIG,
} from './client';
import {
  generateInitialAnalysisPrompt,
  generateDailyFortunePrompt,
} from './prompts';

export interface GenerateAnalysisOptions {
  name: string;
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  gender: 'male' | 'female';
  analysisType: 'initial' | 'daily';
  previousAnalysis?: string;
}

export interface AnalysisResult {
  text: string;
  json: any;
}

/**
 * Generate AI analysis using Gemini
 */
export async function generateAnalysis(
  options: GenerateAnalysisOptions
): Promise<AnalysisResult> {
  const model = options.analysisType === 'initial' ? flashModel : proModel;

  const prompt =
    options.analysisType === 'initial'
      ? generateInitialAnalysisPrompt(options)
      : generateDailyFortunePrompt({
          ...options,
          today: new Date().toISOString().split('T')[0],
        });

  const systemInstruction =
    options.analysisType === 'initial'
      ? SYSTEM_INSTRUCTIONS.initial
      : SYSTEM_INSTRUCTIONS.daily;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction,
      generationConfig: GENERATION_CONFIG,
    });

    const text = result.response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    const json = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

    return { text, json };
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('AI 분석 생성 중 오류가 발생했습니다.');
  }
}

/**
 * Generate analysis with retry logic (exponential backoff)
 */
export async function generateWithRetry(
  options: GenerateAnalysisOptions,
  maxRetries: number = 3
): Promise<AnalysisResult> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await generateAnalysis(options);
    } catch (error) {
      lastError = error as Error;

      // 재시도 전 대기 (지수 백오프)
      const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.log(
        `[Gemini] Attempt ${attempt + 1} failed, retrying in ${waitTime}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError!;
}

/**
 * Generate analysis with timeout
 */
export async function generateWithTimeout(
  options: GenerateAnalysisOptions,
  timeoutMs: number = 30000
): Promise<AnalysisResult> {
  return Promise.race([
    generateWithRetry(options),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('AI 분석 시간이 초과되었습니다.')),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Validate analysis JSON structure
 */
export function validateAnalysisJson(
  json: any,
  type: 'initial' | 'daily'
): boolean {
  if (!json) return false;

  if (type === 'initial') {
    return !!(
      json.overall_score &&
      json.fortune_aspects?.career?.score &&
      json.fortune_aspects?.wealth?.score &&
      json.fortune_aspects?.health?.score &&
      json.fortune_aspects?.relationship?.score &&
      Array.isArray(json.lucky_elements) &&
      Array.isArray(json.warnings)
    );
  }

  if (type === 'daily') {
    return !!(
      json.date &&
      json.overall_score &&
      json.fortune_aspects?.career?.score &&
      json.fortune_aspects?.wealth?.score &&
      json.fortune_aspects?.health?.score &&
      json.fortune_aspects?.relationship?.score &&
      json.time_slots?.morning?.score &&
      json.time_slots?.afternoon?.score &&
      json.time_slots?.evening?.score &&
      Array.isArray(json.actions) &&
      Array.isArray(json.warnings) &&
      Array.isArray(json.lucky_elements)
    );
  }

  return false;
}

/**
 * Sanitize AI response
 */
export function sanitizeResponse(text: string): string {
  // Remove excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  text = text.trim();

  return text;
}
