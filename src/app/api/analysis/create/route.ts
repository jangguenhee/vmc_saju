import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import { ensureUserInDatabase } from '@/lib/auth/ensure-user';
import {
  generateWithTimeout,
  validateAnalysisJson,
  sanitizeResponse,
} from '@/lib/gemini/generate';

export async function POST(req: Request) {
  try {
    // 1. Authenticate with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: '로그인이 필요합니다.',
        },
        { status: 401 }
      );
    }

    // 2. Ensure user exists in database
    await ensureUserInDatabase(clerkId);

    // 3. Get request data
    const body = await req.json();
    const { name, birthDate, birthTime, gender } = body;

    // 4. Validate input
    if (!name || !birthDate || !gender) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: '필수 정보를 입력해주세요. (이름, 생년월일, 성별)',
        },
        { status: 400 }
      );
    }

    if (!['male', 'female'].includes(gender)) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: '성별은 male 또는 female이어야 합니다.',
        },
        { status: 400 }
      );
    }

    // 5. Get user from Supabase
    const supabase = await createPureClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', clerkId)
      .single();

    if (userError || !user) {
      console.error('[Analysis API] User not found:', clerkId, userError);
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: '사용자를 찾을 수 없습니다.',
        },
        { status: 404 }
      );
    }

    // 6. Check free trial limit
    if (user.plan === 'free' && user.tests_remaining <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'FREE_TRIAL_EXHAUSTED',
          message:
            '무료 체험 횟수를 모두 사용했습니다. 구독을 시작해보세요!',
          testsRemaining: 0,
        },
        { status: 403 }
      );
    }

    // 7. Check if daily analysis already exists (for paid users)
    const today = new Date().toISOString().split('T')[0];

    if (user.plan === 'paid') {
      const { data: existingAnalysis } = await supabase
        .from('analysis')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'daily')
        .gte('created_at', `${today}T00:00:00Z`)
        .lte('created_at', `${today}T23:59:59Z`)
        .single();

      if (existingAnalysis) {
        return NextResponse.json(
          {
            success: false,
            error: 'DAILY_LIMIT_REACHED',
            message: '오늘 이미 분석을 생성했습니다. 내일 다시 시도해주세요.',
          },
          { status: 429 }
        );
      }
    }

    console.log(
      `[Analysis API] Generating ${user.plan === 'free' ? 'free' : 'paid'} analysis for user:`,
      clerkId
    );

    // 8. Generate AI analysis
    const startTime = Date.now();

    const { text, json } = await generateWithTimeout({
      name,
      birthDate,
      birthTime,
      gender,
      analysisType: user.plan === 'free' ? 'initial' : 'daily',
    });

    const processingTime = Date.now() - startTime;

    // 9. Validate response
    const analysisType = user.plan === 'free' ? 'initial' : 'daily';

    if (!validateAnalysisJson(json, analysisType)) {
      console.error('[Analysis API] Invalid JSON format:', json);
      return NextResponse.json(
        {
          success: false,
          error: 'AI_VALIDATION_FAILED',
          message: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.',
        },
        { status: 500 }
      );
    }

    const sanitizedText = sanitizeResponse(text);

    // 10. Save to database
    const { data: analysis, error: dbError } = await supabase
      .from('analysis')
      .insert({
        user_id: user.id,
        input: {
          name,
          birthDate,
          birthTime,
          gender,
        },
        output_markdown: sanitizedText,
        output_json: json,
        model: user.plan === 'free' ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
        type: analysisType === 'initial' ? 'free' : 'daily',
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Analysis API] Database error:', dbError);
      return NextResponse.json(
        {
          success: false,
          error: 'DATABASE_ERROR',
          message: '분석 결과 저장 중 오류가 발생했습니다.',
        },
        { status: 500 }
      );
    }

    // 11. Decrement free trial count (for free users only)
    if (user.plan === 'free') {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          tests_remaining: user.tests_remaining - 1,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('[Analysis API] Error updating tests_remaining:', updateError);
      }
    }

    // 12. Update last_daily_report_date (for paid users)
    if (user.plan === 'paid') {
      await supabase
        .from('users')
        .update({
          last_daily_report_date: today,
        })
        .eq('id', user.id);
    }

    console.log(
      `[Analysis API] ✅ Analysis created: ${analysis.id} (${processingTime}ms)`
    );

    // 13. Return response
    return NextResponse.json({
      success: true,
      data: {
        id: analysis.id,
        analysisType: analysis.type,
        aiModel: analysis.model,
        resultText: analysis.output_markdown,
        resultJson: json,
        createdAt: analysis.created_at,
      },
      testsRemaining:
        user.plan === 'free' ? user.tests_remaining - 1 : undefined,
    });
  } catch (error) {
    console.error('[Analysis API] Unexpected error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'AI_GENERATION_FAILED',
        message:
          'AI 분석 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      },
      { status: 500 }
    );
  }
}
