import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import { approvePayment } from '@/lib/tosspayments/client';

export async function GET(req: Request) {
  try {
    // 1. Authenticate
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      const redirectUrl = new URL('/sign-in', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    // 2. Get payment info from query params
    const { searchParams } = new URL(req.url);
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (!paymentKey || !orderId || !amount) {
      console.error('[Payment Success] Missing parameters');
      const redirectUrl = new URL('/subscription?error=invalid_params', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    const amountNumber = Number(amount);

    // 3. Approve payment with TossPayments
    let payment;
    try {
      payment = await approvePayment(paymentKey, orderId, amountNumber);
    } catch (tossError) {
      console.error('[Payment Success] TossPayments approval failed:', tossError);
      const redirectUrl = new URL('/subscription?error=payment_approval_failed', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    // 4. Save to database
    const supabase = await createPureClient();

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', clerkId)
      .single();

    if (userError || !user) {
      console.error('[Payment Success] User not found:', clerkId);
      const redirectUrl = new URL('/subscription?error=user_not_found', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    // Calculate next billing date (1 month from now)
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    // Update user to paid plan
    const { error: updateError } = await supabase
      .from('users')
      .update({
        plan: 'paid',
        billing_key: payment.billingKey || null,
        next_billing_date: nextBillingDate.toISOString().split('T')[0],
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Payment Success] User update failed:', updateError);
      const redirectUrl = new URL('/subscription?error=database_error', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    // Log payment
    const { error: logError } = await supabase
      .from('payment_logs')
      .insert({
        user_id: user.id,
        order_id: orderId,
        amount: amountNumber,
        status: 'success',
        billing_key: payment.billingKey || null,
        payment_key: paymentKey,
        approved_at: new Date().toISOString(),
      });

    if (logError) {
      console.error('[Payment Success] Payment log failed:', logError);
      // Continue even if logging fails
    }

    console.log(`[Payment Success] ✅ User ${clerkId} subscribed successfully`);

    // 5. Redirect to success page
    const redirectUrl = new URL('/subscription?success=true', req.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Payment Success] Unexpected error:', error);
    const redirectUrl = new URL('/subscription?error=unexpected_error', new URL(req.url).origin);
    return NextResponse.redirect(redirectUrl);
  }
}
