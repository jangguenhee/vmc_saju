import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/constants/env";

// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// Types
export interface SajuAnalysisInput {
  name: string;
  birthDate: string;
  birthTime?: string;
  gender?: string;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

// Default retry configuration
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry logic with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      console.warn(
        `Gemini API attempt ${attempt + 1} failed. Retrying in ${delay}ms...`,
        error
      );

      await sleep(delay);

      // Exponential backoff with max delay cap
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  throw new Error(
    `Gemini API failed after ${config.maxRetries + 1} attempts: ${lastError.message}`
  );
}

/**
 * Generate daily Saju analysis prompt
 */
function generateDailySajuPrompt(input: SajuAnalysisInput): string {
  const { name, birthDate, birthTime, gender } = input;
  const todayDate = new Date().toISOString().split("T")[0];

  return `
당신은 현대적인 감각을 지닌 명리학자이자 AI 심리 분석가입니다.
입력된 사주 정보와 오늘 날짜를 바탕으로, "오늘의 운세"를 다섯 가지 영역에서 종합적으로 해석해주세요.
당신의 목표는 사용자가 "지금 내 상태와 하루의 방향성이 정말 정확하다"는 공감을 느끼게 하는 것입니다.

## 기본 정보
- 이름: ${name}
- 생년월일: ${birthDate}
- 출생시간: ${birthTime || "모름"}
- 성별: ${gender || "미상"}
- 오늘 날짜: ${todayDate}

## 작성 원칙
1. **명리학적 기반**: 천간지지, 일간의 오행, 오늘의 일진(日辰)과의 상호작용을 기반으로 분석합니다.
2. **심리적 통찰**: 사용자의 감정 에너지 흐름을 중심으로, 내면 상태를 설명합니다.
3. **현대적 언어**: 고전 용어는 간단히 풀이하며, 부드럽고 일상적인 언어로 전달합니다.
4. **균형감 유지**: 긍정과 주의점이 함께 제시되어야 합니다.
5. **행동 지향성**: 하루를 잘 보내기 위한 구체적 행동 제안을 포함합니다.
6. **마크다운 형식**으로 작성합니다.

## 출력 구조
아래 다섯 섹션을 반드시 포함합니다.

---

### 🌅 1. 오늘의 총운
- 오늘 하루의 전반적 기운을 요약합니다.
- 오행의 균형과 오늘의 일진(日干日支)이 사용자의 일간과 어떤 관계를 가지는지 간략히 설명합니다.
- 전체적인 톤은 '오늘의 분위기'를 묘사하듯 서술하세요.

---

### 💭 2. 심리와 에너지 흐름
- 오늘 감정의 흐름과 내면 상태를 묘사합니다.
- 스트레스나 불안 요인을 다루되, 회복의 방향을 제시합니다.
- 명리학적으로 기운이 "쇠"일 때는 '내면 정리'의 날로,
  "왕성"할 때는 '외부로 에너지 발산'의 날로 제안합니다.

---

### 💼 3. 일과 재물운
- 직업적 성취, 협력 관계, 재정적 흐름을 분석합니다.
- 관성(職), 재성(財)의 조화를 고려해 실질적인 조언을 제공합니다.
- "계획보다 실행이 유리한 날 / 협업이 좋은 날 / 혼자 집중해야 하는 날" 등으로 구체화하세요.

---

### 💖 4. 인간관계와 사랑
- 연애, 가족, 친구 등 관계 전반의 흐름을 분석합니다.
- 일지(배우자궁)와 재성/관성 흐름에 따라
  '말 한마디로 관계가 달라질 수 있는 날' 등의 구체적인 감정 제안 포함.
- 솔로라면 만남 가능성, 커플이라면 소통의 포인트를 제시합니다.

---

### 🌙 5. 오늘의 조언 & 행운 포인트
- 하루를 잘 마무리하기 위한 행동 제안, 명상/휴식/행운 아이템을 제시합니다.
- 다음 세 가지 항목은 반드시 포함:
  1. **오늘의 키워드** (예: "균형", "겸손", "속도 조절")
  2. **행운 색상**
  3. **행운 시간대**

---

## 톤 & 스타일 가이드
- 문체는 부드럽고 현대적이어야 합니다.
- '~입니다', '~하세요' 형태로 존중을 담은 어투를 사용합니다.
- 각 섹션은 2~3문단 내로 간결하게 구성합니다.
- 사용자가 "오늘 하루를 어떻게 보내야 할지" 명확히 감을 잡을 수 있게 만듭니다.
`;
}

/**
 * Generate Saju analysis using Gemini Flash (Free tier)
 * Uses gemini-2.5-flash model with retry logic
 */
export async function generateFreeSajuAnalysis(
  input: SajuAnalysisInput,
  retryOptions?: RetryOptions
): Promise<string> {
  return withRetry(async () => {
    const model = genAI.getGenerativeModel({ model: env.GEMINI_FLASH_MODEL });
    const prompt = generateDailySajuPrompt(input);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error("Gemini API returned empty response");
    }

    return text;
  }, retryOptions);
}

/**
 * Generate Saju analysis using Gemini Pro (Paid tier)
 * Uses gemini-2.5-pro model with retry logic
 */
export async function generateProSajuAnalysis(
  input: SajuAnalysisInput,
  retryOptions?: RetryOptions
): Promise<string> {
  return withRetry(async () => {
    const model = genAI.getGenerativeModel({ model: env.GEMINI_PRO_MODEL });
    const prompt = generateDailySajuPrompt(input);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error("Gemini API returned empty response");
    }

    return text;
  }, retryOptions);
}

/**
 * Generate Saju analysis based on user plan
 * Automatically selects the appropriate model
 */
export async function generateSajuAnalysis(
  input: SajuAnalysisInput,
  plan: "free" | "paid",
  retryOptions?: RetryOptions
): Promise<string> {
  if (plan === "paid") {
    return generateProSajuAnalysis(input, retryOptions);
  } else {
    return generateFreeSajuAnalysis(input, retryOptions);
  }
}
