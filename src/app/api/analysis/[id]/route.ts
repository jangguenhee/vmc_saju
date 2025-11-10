import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate
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

    // 2. Get analysis ID
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: '분석 ID가 필요합니다.',
        },
        { status: 400 }
      );
    }

    // 3. Get analysis from database
    const supabase = await createPureClient();

    const { data: analysis, error } = await supabase
      .from('analysis')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !analysis) {
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: '분석을 찾을 수 없습니다.',
        },
        { status: 404 }
      );
    }

    // 4. Verify ownership
    const { data: user } = await supabase
      .from('users')
      .select('id, plan, tests_remaining')
      .eq('id', clerkId)
      .single();

    if (!user || analysis.user_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: '이 분석에 접근할 권한이 없습니다.',
        },
        { status: 403 }
      );
    }

    // 5. Return analysis
    return NextResponse.json({
      success: true,
      data: {
        id: analysis.id,
        input: analysis.input,
        output_markdown: analysis.output_markdown,
        model: analysis.model,
        type: analysis.type,
        created_at: analysis.created_at,
      },
      user: {
        plan: user.plan,
        testsRemaining: user.tests_remaining,
      },
    });
  } catch (error) {
    console.error('[Analysis Get API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: '분석 조회 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
