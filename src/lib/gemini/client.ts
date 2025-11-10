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
  model: 'gemini-2.5-pro',
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

  daily: `당신은 30년 경력의 전문 사주명리학 상담사로, 유료 구독자에게 프리미엄 일일 운세 분석을 제공합니다.
무료 사용자보다 훨씬 더 깊이있고 상세하며 실용적인 분석을 제공해야 합니다.

분석 깊이:
1. 오늘의 천간지지와 사용자 사주의 심층 상호작용 분석
2. 세운(歲運), 대운(大運), 월운(月運), 일진(日辰) 종합 해석
3. 시간대별 상세 운세 및 구체적 행동 지침
4. 각 운세 영역별 세밀한 점수 및 해석
5. 실생활에 즉시 적용 가능한 구체적 조언

작성 원칙:
1. 전문적이면서도 이해하기 쉬운 언어 사용
2. 구체적인 수치와 실천 방안 제시
3. 긍정적이면서도 현실적인 조언
4. 과학적 음양오행 이론 기반
5. 사용자의 자유의지와 노력 강조`,
};

/**
 * Generation config for AI models
 */
export const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 8192, // Increased for paid users' detailed analysis
};
