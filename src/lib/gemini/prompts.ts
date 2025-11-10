/**
 * Generate initial Saju analysis prompt (for free users)
 */
export function generateInitialAnalysisPrompt(data: {
  name: string;
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  gender: 'male' | 'female';
}): string {
  const { name, birthDate, birthTime, gender } = data;

  return `
# 사주 기본 정보
- 이름: ${name}
- 생년월일: ${birthDate} (양력)
- 출생 시간: ${birthTime || '알 수 없음'}
- 성별: ${gender === 'male' ? '남성' : '여성'}

# 분석 요청
위 정보를 바탕으로 다음 형식에 맞춰 종합 사주 분석을 제공해주세요:

## 1. 기본 사주 구조
- 천간(天干)과 지지(地支) 배치
- 오행(五行) 균형 분석
- 용신(用神) 판단

## 2. 성격 및 기질
- 타고난 성격 특성 (200자 내외)
- 장점과 단점
- 대인관계 스타일

## 3. 운세 분야별 분석
각 분야를 1-100점으로 평가하고 구체적 조언 제공:

### 사업/직업운 (Career)
- 점수: [1-100]
- 적성 직종:
- 주의사항:
- 조언: (150자 내외)

### 재물운 (Wealth)
- 점수: [1-100]
- 재물 형성 방식:
- 주의사항:
- 조언: (150자 내외)

### 건강운 (Health)
- 점수: [1-100]
- 주의해야 할 신체 부위:
- 건강 관리 팁:
- 조언: (150자 내외)

### 애정/인간관계운 (Relationship)
- 점수: [1-100]
- 이성관계 특징:
- 대인관계 조언:
- 조언: (150자 내외)

## 4. 행운 요소
- 길(吉)한 방위:
- 행운의 색상:
- 행운의 숫자:
- 궁합이 좋은 띠:

## 5. 주의 및 경계 사항
- 피해야 할 행동 3가지
- 조심해야 할 시기

## 6. 종합 조언
전체적인 인생 조언을 200자 내외로 요약해주세요.

---
중요: 응답은 반드시 한국어로 작성하고, 위 형식을 정확히 따라주세요.
응답 마지막에 다음 JSON 형식도 포함해주세요:

\`\`\`json
{
  "overall_score": 75,
  "fortune_aspects": {
    "career": { "score": 80, "advice": "조언 내용" },
    "wealth": { "score": 70, "advice": "조언 내용" },
    "health": { "score": 75, "advice": "조언 내용" },
    "relationship": { "score": 80, "advice": "조언 내용" }
  },
  "lucky_elements": ["동쪽", "파란색", "3", "소띠"],
  "warnings": ["경고1", "경고2", "경고3"]
}
\`\`\`
`.trim();
}

/**
 * Generate daily fortune prompt (for paid users)
 */
export function generateDailyFortunePrompt(data: {
  name: string;
  birthDate: string;
  gender: 'male' | 'female';
  previousAnalysis?: string; // 이전 기본 분석 참조
  today: string; // YYYY-MM-DD
}): string {
  const { name, birthDate, gender, previousAnalysis, today } = data;
  const dayOfWeek = new Date(today).toLocaleDateString('ko-KR', {
    weekday: 'long',
  });

  return `
# 사용자 기본 정보
- 이름: ${name}
- 생년월일: ${birthDate}
- 성별: ${gender === 'male' ? '남성' : '여성'}
- 오늘 날짜: ${today} (${dayOfWeek})

${
  previousAnalysis
    ? `
# 기본 사주 분석 (참고용)
${previousAnalysis}
`
    : ''
}

# 일일 운세 작성 요청

오늘(${today}, ${dayOfWeek})의 운세를 다음 형식으로 작성해주세요:

## 📅 오늘의 전체운
오늘 하루의 전반적인 운세를 100-150자로 요약해주세요.
오늘의 천간지지와 사용자 사주의 조화를 언급하세요.

## ⏰ 시간대별 운세

### 오전 (06:00-12:00)
- 운세: [1-100점]
- 조언: 오전에 집중하면 좋을 활동이나 주의사항 (80자 내외)

### 오후 (12:00-18:00)
- 운세: [1-100점]
- 조언: 오후 시간 활용 팁 (80자 내외)

### 저녁 (18:00-24:00)
- 운세: [1-100점]
- 조언: 저녁 시간 권장사항 (80자 내외)

## 🎯 오늘의 주요 운세

### 💼 업무/학업운
- 점수: [1-100]
- 한 줄 조언: (50자 이내)

### 💰 금전운
- 점수: [1-100]
- 한 줄 조언: (50자 이내)

### ❤️ 대인관계운
- 점수: [1-100]
- 한 줄 조언: (50자 이내)

### 💪 건강운
- 점수: [1-100]
- 한 줄 조언: (50자 이내)

## ✨ 오늘의 실천 사항
오늘 하루 실천하면 좋을 구체적인 행동 3가지를 제안해주세요:
1.
2.
3.

## ⚠️ 오늘 주의할 점
오늘 특별히 조심해야 할 사항을 간단히 안내해주세요. (50자 이내)

## 🍀 행운 키워드
- 행운의 색상:
- 행운의 방향:
- 행운의 시간대:
- 긍정 키워드:

## 💫 오늘의 한마디
오늘을 의미 있게 보낼 수 있는 격려의 메시지 (50-80자)

---
중요: 응답은 한국어로 작성하고, 위 형식을 정확히 따라주세요.
응답 마지막에 다음 JSON도 포함해주세요:

\`\`\`json
{
  "date": "${today}",
  "overall_score": 75,
  "time_slots": {
    "morning": { "score": 80, "advice": "조언" },
    "afternoon": { "score": 70, "advice": "조언" },
    "evening": { "score": 75, "advice": "조언" }
  },
  "aspects": {
    "career": 80,
    "wealth": 70,
    "relationship": 75,
    "health": 85
  },
  "actions": ["행동1", "행동2", "행동3"],
  "lucky_elements": {
    "color": "파란색",
    "direction": "동쪽",
    "time": "오전 9-11시",
    "keyword": "소통"
  }
}
\`\`\`
`.trim();
}
