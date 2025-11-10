import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import { deleteBillingKey } from '@/lib/tosspayments/client';

export async function POST() {
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

    // 2. Get user from Supabase
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

    // 3. Check if user has active subscription
    if (user.plan !== 'paid' || !user.billing_key) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_ACTIVE_SUBSCRIPTION',
          message: '활성화된 구독이 없습니다.',
        },
        { status: 400 }
      );
    }

    // 4. Delete billing key from TossPayments
    try {
      await deleteBillingKey(user.billing_key, clerkId);
    } catch (tossError) {
      console.error('[Subscription Cancel] TossPayments error:', tossError);
      // Continue even if Toss deletion fails (billing key might already be deleted)
    }

    // 5. Update user status to cancelled
    const { error: updateError } = await supabase
      .from('users')
      .update({
        plan: 'cancelled',
        billing_key: null,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Subscription Cancel] Database update error:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: 'DATABASE_ERROR',
          message: '구독 취소 처리 중 오류가 발생했습니다.',
        },
        { status: 500 }
      );
    }

    console.log(`[Subscription Cancel] ✅ User ${clerkId} cancelled subscription`);

    // 6. Return success
    return NextResponse.json({
      success: true,
      message:
        '구독이 취소되었습니다. 현재 결제 기간 종료 시까지 서비스를 이용하실 수 있습니다.',
      subscriptionEndDate: user.next_billing_date,
    });
  } catch (error) {
    console.error('[Subscription Cancel API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: '구독 취소 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
