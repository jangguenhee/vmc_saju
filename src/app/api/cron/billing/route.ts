import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import { chargeWithBillingKey } from '@/lib/tosspayments/client';

const MONTHLY_PRICE = 3650;

/**
 * Monthly Billing Cron Job
 *
 * Runs daily at 1 AM KST (via Supabase cron)
 * Charges users whose next_billing_date is today
 */
export async function GET(req: Request) {
  try {
    // 1. Verify cron authorization (optional: add secret token)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Billing Cron] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const supabase = await createPureClient();

    // 2. Find users who need to be charged today
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select('*')
      .eq('plan', 'paid')
      .eq('next_billing_date', today)
      .not('billing_key', 'is', null);

    if (queryError) {
      console.error('[Billing Cron] Query error:', queryError);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      console.log('[Billing Cron] No users need billing today');
      return NextResponse.json({
        success: true,
        message: 'No users need billing today',
        count: 0,
      });
    }

    console.log(
      `[Billing Cron] Processing ${users.length} users for billing`
    );

    // 3. Process billing for each user
    const results = [];

    for (const user of users) {
      try {
        const orderId = `billing_${user.id}_${Date.now()}`;
        const orderName = '365일 사주 월 구독';

        // Charge with billing key
        const payment = await chargeWithBillingKey(
          user.billing_key,
          user.id, // customerKey
          MONTHLY_PRICE,
          orderId,
          orderName
        );

        // Calculate next billing date (+1 month)
        const nextBillingDate = new Date(user.next_billing_date);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        const nextBillingDateStr = nextBillingDate.toISOString().split('T')[0];

        // Update user's next billing date
        const { error: updateError } = await supabase
          .from('users')
          .update({
            next_billing_date: nextBillingDateStr,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(
            `[Billing Cron] ⚠️ User update failed for ${user.id}:`,
            updateError
          );
        }

        // Log payment
        const { error: logError } = await supabase
          .from('payment_logs')
          .insert({
            user_id: user.id,
            order_id: orderId,
            amount: MONTHLY_PRICE,
            status: 'success',
            billing_key: user.billing_key,
            payment_key: payment.paymentKey || null,
            approved_at: new Date().toISOString(),
          });

        if (logError) {
          console.error(
            `[Billing Cron] ⚠️ Payment log failed for ${user.id}:`,
            logError
          );
        }

        console.log(
          `[Billing Cron] ✅ Charged user ${user.id} (₩${MONTHLY_PRICE})`
        );
        results.push({
          userId: user.id,
          email: user.email,
          status: 'success',
          amount: MONTHLY_PRICE,
          nextBillingDate: nextBillingDateStr,
        });
      } catch (error: any) {
        console.error(
          `[Billing Cron] ❌ Billing failed for user ${user.id}:`,
          error
        );

        // Suspend user on payment failure
        const { error: suspendError } = await supabase
          .from('users')
          .update({
            plan: 'suspended',
          })
          .eq('id', user.id);

        if (suspendError) {
          console.error(
            `[Billing Cron] ⚠️ Suspend failed for ${user.id}:`,
            suspendError
          );
        }

        // Log failed payment
        await supabase.from('payment_logs').insert({
          user_id: user.id,
          order_id: `billing_${user.id}_${Date.now()}`,
          amount: MONTHLY_PRICE,
          status: 'failed',
          billing_key: user.billing_key,
          payment_key: null,
          approved_at: null,
        });

        results.push({
          userId: user.id,
          email: user.email,
          status: 'failed',
          error: error.message || 'Unknown error',
        });

        // TODO: Send email notification to user
      }
    }

    // 4. Return summary
    const successCount = results.filter((r) => r.status === 'success').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    console.log(
      `[Billing Cron] 🎉 Completed: ${successCount} success, ${failedCount} failed`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${users.length} users`,
      results: {
        total: users.length,
        success: successCount,
        failed: failedCount,
        details: results,
      },
    });
  } catch (error) {
    console.error('[Billing Cron] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
