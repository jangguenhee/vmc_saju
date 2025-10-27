# AI Prompts - 365일 사주

## Overview

이 문서는 Gemini AI를 사용한 사주 분석 프롬프트 전략을 제공합니다.

**Models Used**:
- **Free Tier**: `gemini-2.5-flash` - 빠른 기본 분석
- **Paid Tier**: `gemini-2.5-pro` - 상세한 일일 운세

---

## Gemini API Setup

### Installation

```bash
npm install @google/generative-ai
```

### Configuration

```typescript
// lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const flashModel = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash-exp'
});

export const proModel = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash-thinking-exp-1219'
});
```

---

## Prompt Templates

### 1. Initial Analysis (Free Tier)

**사용 시점**: 사용자가 처음 사주 분석을 요청할 때

**Model**: `gemini-2.5-flash`

**System Instructions**:
```
당신은 30년 경력의 전문 사주명리학 상담사입니다. 
사용자의 생년월일시를 바탕으로 사주팔자를 분석하고, 
과학적이면서도 공감 가능한 조언을 제공합니다.

분석 원칙:
1. 음양오행 이론에 기반한 체계적 분석
2. 구체적이고 실용적인 조언 제공
3. 긍정적이면서도 현실적인 톤 유지
4. 과도한 미신적 표현 지양
5. 사용자의 자유의지와 노력 강조
```

**Prompt Template**:
```typescript
function generateInitialAnalysisPrompt(data: {
  birthDate: string;    // YYYY-MM-DD
  birthTime?: string;   // HH:MM
  gender: 'male' | 'female';
  lunarCalendar?: boolean;
}): string {
  const { birthDate, birthTime, gender, lunarCalendar } = data;
  
  return `
# 사주 기본 정보
- 생년월일: ${birthDate} ${lunarCalendar ? '(음력)' : '(양력)'}
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
```

---

### 2. Daily Fortune (Paid Tier)

**사용 시점**: 유료 사용자에게 매일 자동 생성

**Model**: `gemini-2.5-pro`

**System Instructions**:
```
당신은 사용자의 사주를 기반으로 일일 운세를 제공하는 전문가입니다.
이미 분석된 사용자의 기본 사주 정보를 참고하여,
오늘 하루의 운세를 구체적이고 실용적으로 안내합니다.

작성 원칙:
1. 오늘 날짜와 요일을 명시
2. 당일의 천간지지와 사용자 사주의 상호작용 분석
3. 시간대별 운세 (오전/오후/저녁)
4. 실천 가능한 구체적 행동 제안
5. 너무 불길한 표현은 완화하되 솔직하게 전달
```

**Prompt Template**:
```typescript
function generateDailyFortunePrompt(data: {
  birthDate: string;
  gender: string;
  previousAnalysis?: string;  // 이전 기본 분석 참조
  today: string;  // YYYY-MM-DD
}): string {
  const { birthDate, gender, previousAnalysis, today } = data;
  const dayOfWeek = new Date(today).toLocaleDateString('ko-KR', { weekday: 'long' });
  
  return `
# 사용자 기본 정보
- 생년월일: ${birthDate}
- 성별: ${gender === 'male' ? '남성' : '여성'}
- 오늘 날짜: ${today} (${dayOfWeek})

${previousAnalysis ? `
# 기본 사주 분석 (참고용)
${previousAnalysis}
` : ''}

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
```

---

## API Implementation

### Basic Usage

```typescript
// lib/gemini.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface GenerateAnalysisOptions {
  birthDate: string;
  birthTime?: string;
  gender: 'male' | 'female';
  lunarCalendar?: boolean;
  analysisType: 'initial' | 'daily';
  previousAnalysis?: string;
}

export async function generateAnalysis(
  options: GenerateAnalysisOptions
): Promise<{ text: string; json: any }> {
  const model = options.analysisType === 'initial' 
    ? genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
    : genAI.getGenerativeModel({ model: 'gemini-2.0-flash-thinking-exp-1219' });

  const prompt = options.analysisType === 'initial'
    ? generateInitialAnalysisPrompt(options)
    : generateDailyFortunePrompt({
        ...options,
        today: new Date().toISOString().split('T')[0]
      });

  // System instruction 설정
  const systemInstruction = options.analysisType === 'initial'
    ? "당신은 30년 경력의 전문 사주명리학 상담사입니다..."
    : "당신은 사용자의 사주를 기반으로 일일 운세를 제공하는 전문가입니다...";

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 4096,
      }
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
```

---

## Error Handling & Retry Logic

### Retry with Exponential Backoff

```typescript
async function generateWithRetry(
  options: GenerateAnalysisOptions,
  maxRetries: number = 3
): Promise<{ text: string; json: any }> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await generateAnalysis(options);
    } catch (error) {
      lastError = error as Error;
      
      // 재시도 전 대기 (지수 백오프)
      const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.log(`Attempt ${attempt + 1} failed, retrying in ${waitTime}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError!;
}
```

### Timeout Handling

```typescript
async function generateWithTimeout(
  options: GenerateAnalysisOptions,
  timeoutMs: number = 30000
): Promise<{ text: string; json: any }> {
  return Promise.race([
    generateWithRetry(options),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('AI 분석 시간이 초과되었습니다.')), timeoutMs)
    )
  ]);
}
```

---

## Response Validation

### Validate JSON Structure

```typescript
function validateAnalysisJson(json: any, type: 'initial' | 'daily'): boolean {
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
      json.time_slots?.morning?.score &&
      json.time_slots?.afternoon?.score &&
      json.time_slots?.evening?.score &&
      json.aspects &&
      Array.isArray(json.actions) &&
      json.lucky_elements
    );
  }

  return false;
}
```

### Sanitize Response

```typescript
function sanitizeResponse(text: string): string {
  // Remove excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // Remove markdown code fences if present in main text
  text = text.replace(/```[\s\S]*?```/g, '');
  
  // Trim whitespace
  text = text.trim();
  
  return text;
}
```

---

## Usage in API Routes

### Example: `/api/analysis/generate`

```typescript
import { generateWithTimeout, validateAnalysisJson } from '@/lib/gemini';
import { auth } from '@clerk/nextjs';
import { createClient } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    // 1. Authenticate
    const { userId: clerkId } = auth();
    if (!clerkId) {
      return Response.json(
        { error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 2. Get request data
    const { birthDate, birthTime, gender, lunarCalendar } = await req.json();

    // 3. Validate input
    if (!birthDate || !gender) {
      return Response.json(
        { error: 'VALIDATION_ERROR', message: '필수 정보를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 4. Check user's plan and remaining tests
    const supabase = createClient();
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', clerkId)
      .single();

    if (!user) {
      return Response.json(
        { error: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 5. Check free trial limit
    if (user.plan === 'free' && user.tests_remaining <= 0) {
      return Response.json(
        {
          error: 'FREE_TRIAL_EXHAUSTED',
          message: '무료 체험 횟수를 모두 사용했습니다. 구독을 시작해보세요!',
          testsRemaining: 0
        },
        { status: 403 }
      );
    }

    // 6. Generate analysis
    const startTime = Date.now();
    const { text, json } = await generateWithTimeout({
      birthDate,
      birthTime,
      gender,
      lunarCalendar: lunarCalendar || false,
      analysisType: 'initial'
    });

    const processingTime = Date.now() - startTime;

    // 7. Validate response
    if (!validateAnalysisJson(json, 'initial')) {
      throw new Error('AI 응답 형식이 올바르지 않습니다.');
    }

    // 8. Save to database
    const { data: analysis, error: dbError } = await supabase
      .from('analyses')
      .insert({
        user_id: user.id,
        birth_date: birthDate,
        birth_time: birthTime,
        gender,
        lunar_calendar: lunarCalendar || false,
        analysis_type: 'initial',
        analysis_date: new Date().toISOString().split('T')[0],
        ai_model: 'gemini-2.5-flash',
        result_text: text,
        result_json: json,
        processing_time_ms: processingTime
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 9. Decrement free trial count
    if (user.plan === 'free') {
      await supabase
        .from('users')
        .update({ 
          tests_remaining: user.tests_remaining - 1 
        })
        .eq('id', user.id);
    }

    // 10. Return response
    return Response.json({
      success: true,
      data: {
        id: analysis.id,
        analysisType: analysis.analysis_type,
        aiModel: analysis.ai_model,
        resultText: analysis.result_text,
        resultJson: analysis.result_json,
        createdAt: analysis.created_at
      },
      testsRemaining: user.plan === 'free' ? user.tests_remaining - 1 : undefined
    });

  } catch (error) {
    console.error('Analysis generation error:', error);
    return Response.json(
      {
        error: 'AI_GENERATION_FAILED',
        message: 'AI 분석 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      },
      { status: 500 }
    );
  }
}
```

---

## Prompt Engineering Tips

### 1. Be Specific with Output Format

항상 원하는 출력 형식을 명확히 지정하세요. 예시를 포함하면 더욱 좋습니다.

### 2. Use Structured JSON

분석 결과를 구조화된 JSON으로도 받으면 프론트엔드에서 활용하기 쉽습니다.

### 3. Set Appropriate Temperature

- **Initial Analysis**: `temperature: 0.7` (창의성과 일관성 균형)
- **Daily Fortune**: `temperature: 0.8` (약간 더 다양한 표현)

### 4. Limit Token Usage

`maxOutputTokens: 4096`로 제한하여 비용 관리

### 5. Include Safety Settings

```typescript
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  // ... other categories
];
```

---

## Cost Optimization

### Token Usage Estimation

**Initial Analysis**:
- Input: ~500 tokens
- Output: ~3000 tokens
- Total: ~3500 tokens per request

**Daily Fortune**:
- Input: ~1000 tokens (with previous analysis)
- Output: ~2000 tokens
- Total: ~3000 tokens per request

### Monthly Cost Estimate (1000 Users)

```
무료 사용자 (3000명 × 3회):
- 9,000 requests × 3500 tokens = 31.5M tokens

유료 사용자 (1000명 × 30일):
- 30,000 requests × 3000 tokens = 90M tokens

Total: ~121.5M tokens/month
```

Gemini 2.0 Flash 가격 (예시): $0.075 per 1M tokens
→ Monthly cost: ~$9.11

---

## Testing Prompts

### Test Cases

```typescript
// Test data
const testCases = [
  {
    name: 'Standard case',
    data: {
      birthDate: '1990-05-15',
      birthTime: '14:30',
      gender: 'male',
      lunarCalendar: false
    }
  },
  {
    name: 'No birth time',
    data: {
      birthDate: '1985-12-25',
      gender: 'female',
      lunarCalendar: false
    }
  },
  {
    name: 'Lunar calendar',
    data: {
      birthDate: '1995-03-08',
      birthTime: '09:00',
      gender: 'male',
      lunarCalendar: true
    }
  }
];

// Run tests
for (const testCase of testCases) {
  console.log(`Testing: ${testCase.name}`);
  const result = await generateAnalysis({
    ...testCase.data,
    analysisType: 'initial'
  });
  
  console.log('Valid JSON:', validateAnalysisJson(result.json, 'initial'));
  console.log('---');
}
```

---

## Troubleshooting

### Issue: Inconsistent JSON Format

**Solution**: 
- JSON 예시를 더 명확히 제공
- 응답에서 JSON 추출 로직 강화
- Validation 실패 시 재시도

### Issue: Too Long Responses

**Solution**:
- `maxOutputTokens` 줄이기
- 각 섹션의 글자 수 제한 명시
- "간결하게" 키워드 추가

### Issue: Rate Limit Errors

**Solution**:
- Exponential backoff 재시도 로직 구현
- 여러 API 키 로테이션 고려
- 사용량 모니터링

### Issue: Off-Topic Responses

**Solution**:
- System instruction 강화
- 더 구체적인 프롬프트 작성
- Few-shot examples 추가

---

## Best Practices

1. **Always validate responses** before saving to database
2. **Implement retry logic** for transient errors
3. **Log all API calls** for debugging and cost tracking
4. **Cache common responses** if applicable
5. **Monitor token usage** to optimize costs
6. **Test prompts regularly** as Gemini models update
7. **Sanitize user inputs** before including in prompts
8. **Set reasonable timeouts** (30s recommended)

---

## Future Enhancements

### Potential Improvements

1. **Compatibility Analysis**: 두 사람의 궁합 분석
2. **Detailed Timing**: 특정 날짜/시간의 운세
3. **Career Guidance**: 직업별 상세 조언
4. **Multi-language**: 영어 등 다국어 지원
5. **Voice Output**: TTS 통합
6. **Personalized History**: 과거 분석 학습

---

## Summary

이 문서는 Gemini AI를 활용한 사주 분석의 모든 프롬프트 전략을 다룹니다:

- ✅ Initial analysis (무료) 프롬프트
- ✅ Daily fortune (유료) 프롬프트
- ✅ Error handling 및 retry 로직
- ✅ Response validation
- ✅ Cost optimization
- ✅ Testing strategies

프롬프트는 서비스 초기에 자주 수정될 수 있으므로, 
실제 응답 품질을 모니터링하며 지속적으로 개선하세요.
