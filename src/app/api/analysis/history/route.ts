import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
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

    // 2. Get analyses from database
    const supabase = await createPureClient();

    const { data: analyses, error } = await supabase
      .from('analysis')
      .select('id, type, created_at, input')
      .eq('user_id', clerkId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Analysis History API] Query error:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'DATABASE_ERROR',
          message: '분석 내역을 불러오는데 실패했습니다.',
        },
        { status: 500 }
      );
    }

    // 3. Find today's daily report
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayReport = analyses?.find((a) => {
      const analysisDate = new Date(a.created_at).toISOString().split('T')[0];
      return a.type === 'daily' && analysisDate === today;
    });

    // 4. Return data
    return NextResponse.json({
      success: true,
      data: {
        analyses: analyses || [],
        todayReport: todayReport || null,
      },
    });
  } catch (error) {
    console.error('[Analysis History API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: '분석 내역 조회 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
