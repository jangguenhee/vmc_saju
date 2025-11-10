import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    // 1. Authenticate
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      const redirectUrl = new URL('/sign-in', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    // 2. Get error info from query params
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const message = searchParams.get('message');
    const orderId = searchParams.get('orderId');

    console.error('[Payment Fail]', {
      userId: clerkId,
      code,
      message,
      orderId,
    });

    // 3. Log payment failure to database
    const supabase = await createPureClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', clerkId)
      .single();

    if (user && orderId) {
      // Log failed payment
      await supabase.from('payment_logs').insert({
        user_id: user.id,
        order_id: orderId,
        amount: 0, // Unknown amount at this point
        status: 'failed',
        billing_key: null,
        payment_key: null,
        approved_at: null,
      });
    }

    // 4. Redirect to subscription page with error
    const redirectUrl = new URL('/subscription', req.url);
    redirectUrl.searchParams.set('error', 'payment_failed');
    if (code) redirectUrl.searchParams.set('code', code);
    if (message) redirectUrl.searchParams.set('message', message);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Payment Fail] Unexpected error:', error);
    const redirectUrl = new URL(
      '/subscription?error=unexpected_error',
      new URL(req.url).origin
    );
    return NextResponse.redirect(redirectUrl);
  }
}
