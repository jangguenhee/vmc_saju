import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const TOSS_WEBHOOK_SECRET = process.env.TOSS_WEBHOOK_SECRET || '';

/**
 * Verify TossPayments webhook signature
 * Documentation: https://docs.tosspayments.com/reference/webhook
 */
function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const hmac = crypto.createHmac('sha512', TOSS_WEBHOOK_SECRET);
  const digest = hmac.update(payload).digest('base64');
  return digest === signature;
}

export async function POST(req: Request) {
  try {
    // 1. Verify webhook signature
    const signature = req.headers.get('toss-signature');
    const payload = await req.text();

    if (!signature) {
      console.error('[TossPayments Webhook] Missing signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    if (!verifyWebhookSignature(payload, signature)) {
      console.error('[TossPayments Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse webhook event
    const event = JSON.parse(payload);
    const { eventType, data } = event;

    console.log('[TossPayments Webhook] Event received:', {
      eventType,
      orderId: data.orderId,
      status: data.status,
    });

    const supabase = await createPureClient();

    // 3. Handle different event types
    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED': {
        const { orderId, status, paymentKey, totalAmount, billingKey } = data;

        // Find user by orderId (format: user_id_timestamp)
        const userId = orderId.split('_')[0];

        if (status === 'DONE') {
          // Payment successful
          const nextBillingDate = new Date();
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

          // Update user to paid plan
          const { error: updateError } = await supabase
            .from('users')
            .update({
              plan: 'paid',
              billing_key: billingKey || null,
              next_billing_date: nextBillingDate.toISOString().split('T')[0],
            })
            .eq('id', userId);

          if (updateError) {
            console.error(
              '[TossPayments Webhook] User update failed:',
              updateError
            );
          }

          // Log payment
          await supabase.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            amount: totalAmount,
            status: 'success',
            billing_key: billingKey || null,
            payment_key: paymentKey,
            approved_at: new Date().toISOString(),
          });

          console.log(
            `[TossPayments Webhook] ✅ Payment successful for user ${userId}`
          );
        } else if (status === 'CANCELED') {
          // Payment cancelled
          await supabase.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            amount: totalAmount,
            status: 'cancelled',
            billing_key: null,
            payment_key: paymentKey,
            approved_at: null,
          });

          console.log(
            `[TossPayments Webhook] Payment cancelled for user ${userId}`
          );
        } else if (status === 'FAILED') {
          // Payment failed
          await supabase.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            amount: totalAmount,
            status: 'failed',
            billing_key: null,
            payment_key: paymentKey,
            approved_at: null,
          });

          // Suspend user if they have active subscription
          const { data: user } = await supabase
            .from('users')
            .select('plan')
            .eq('id', userId)
            .single();

          if (user && user.plan === 'paid') {
            await supabase
              .from('users')
              .update({ plan: 'suspended' })
              .eq('id', userId);
          }

          console.log(
            `[TossPayments Webhook] ⚠️ Payment failed for user ${userId}`
          );
        }
        break;
      }

      case 'BILLING_KEY_DELETED': {
        // Billing key was deleted (subscription cancelled)
        const { customerKey } = data;

        await supabase
          .from('users')
          .update({
            plan: 'cancelled',
            billing_key: null,
          })
          .eq('id', customerKey);

        console.log(
          `[TossPayments Webhook] Billing key deleted for user ${customerKey}`
        );
        break;
      }

      default:
        console.log(
          `[TossPayments Webhook] Unhandled event type: ${eventType}`
        );
    }

    // 4. Return success response
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[TossPayments Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
