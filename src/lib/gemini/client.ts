import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY environment variable');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Gemini Flash Model - 무료 사용자용
 * 빠른 기본 분석 제공
 */
export const flashModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
});

/**
 * Gemini Pro Model - 유료 사용자용
 * 상세한 일일 운세 제공
 */
export const proModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-thinking-exp-1219',
});

/**
 * System instructions for AI analysis
 */
export const SYSTEM_INSTRUCTIONS = {
  initial: `당신은 30년 경력의 전문 사주명리학 상담사입니다.
사용자의 생년월일시를 바탕으로 사주팔자를 분석하고,
과학적이면서도 공감 가능한 조언을 제공합니다.

분석 원칙:
1. 음양오행 이론에 기반한 체계적 분석
2. 구체적이고 실용적인 조언 제공
3. 긍정적이면서도 현실적인 톤 유지
4. 과도한 미신적 표현 지양
5. 사용자의 자유의지와 노력 강조`,

  daily: `당신은 사용자의 사주를 기반으로 일일 운세를 제공하는 전문가입니다.
이미 분석된 사용자의 기본 사주 정보를 참고하여,
오늘 하루의 운세를 구체적이고 실용적으로 안내합니다.

작성 원칙:
1. 오늘 날짜와 요일을 명시
2. 당일의 천간지지와 사용자 사주의 상호작용 분석
3. 시간대별 운세 (오전/오후/저녁)
4. 실천 가능한 구체적 행동 제안
5. 너무 불길한 표현은 완화하되 솔직하게 전달`,
};

/**
 * Generation config for AI models
 */
export const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 4096,
};
