import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import { ensureUserInDatabase } from '@/lib/auth/ensure-user';

export async function GET() {
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

    // 2. Ensure user exists in database
    await ensureUserInDatabase(clerkId);

    // 3. Get user from Supabase
    const supabase = await createPureClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', clerkId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: '사용자를 찾을 수 없습니다.',
        },
        { status: 404 }
      );
    }

    // 4. Return subscription status
    return NextResponse.json({
      success: true,
      data: {
        plan: user.plan,
        testsRemaining: user.tests_remaining,
        billingKey: user.billing_key ? '********' : null, // Hide actual key
        nextBillingDate: user.next_billing_date,
        lastDailyReportDate: user.last_daily_report_date,
      },
    });
  } catch (error) {
    console.error('[Subscription Status API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: '구독 상태 조회 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
