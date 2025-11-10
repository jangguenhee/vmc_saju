import { NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';
import { generateWithTimeout } from '@/lib/gemini/generate';
import { generateDailyFortunePrompt } from '@/lib/gemini/prompts';
import { proModel } from '@/lib/gemini/client';

/**
 * Daily Report Cron Job
 *
 * Runs daily at midnight KST (via Supabase cron)
 * Generates daily fortune reports for paid users
 */
export async function GET(req: Request) {
  try {
    // 1. Verify cron authorization (optional: add secret token)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Daily Report Cron] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const supabase = await createPureClient();

    // 2. Find paid users who need daily report
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select('*')
      .eq('plan', 'paid')
      .or(`last_daily_report_date.is.null,last_daily_report_date.lt.${today}`);

    if (queryError) {
      console.error('[Daily Report Cron] Query error:', queryError);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      console.log('[Daily Report Cron] No users need daily report');
      return NextResponse.json({
        success: true,
        message: 'No users need daily report',
        count: 0,
      });
    }

    console.log(
      `[Daily Report Cron] Processing ${users.length} users for daily report`
    );

    // 3. Generate reports for each user
    const results = [];

    for (const user of users) {
      try {
        // Get user's latest analysis for birth info
        const { data: latestAnalysis } = await supabase
          .from('analysis')
          .select('input')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!latestAnalysis || !latestAnalysis.input) {
          console.log(
            `[Daily Report Cron] ⚠️ User ${user.id} has no analysis, skipping`
          );
          results.push({ userId: user.id, status: 'skipped', reason: 'no_analysis' });
          continue;
        }

        const birthInfo = latestAnalysis.input;

        // Generate daily fortune prompt
        const prompt = generateDailyFortunePrompt(
          birthInfo.name,
          birthInfo.birthDate,
          birthInfo.birthTime,
          birthInfo.gender,
          today
        );

        // Call Gemini API with timeout
        const result = await generateWithTimeout(
          {
            model: proModel,
            prompt,
            analysisType: 'daily',
            temperature: 0.7,
          },
          30000 // 30 second timeout
        );

        // Validate result
        if (!result.success || !result.markdown) {
          console.error(
            `[Daily Report Cron] ❌ Generation failed for user ${user.id}`
          );
          results.push({ userId: user.id, status: 'failed', reason: 'ai_error' });
          continue;
        }

        // Save to database
        const { error: insertError } = await supabase.from('analysis').insert({
          user_id: user.id,
          input: {
            ...birthInfo,
            reportDate: today,
          },
          output_markdown: result.markdown,
          output_json: result.json,
          model: 'gemini-2.0-flash-thinking-exp-1219',
          type: 'daily',
        });

        if (insertError) {
          console.error(
            `[Daily Report Cron] ❌ Insert failed for user ${user.id}:`,
            insertError
          );
          results.push({ userId: user.id, status: 'failed', reason: 'db_error' });
          continue;
        }

        // Update user's last_daily_report_date
        const { error: updateError } = await supabase
          .from('users')
          .update({
            last_daily_report_date: today,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(
            `[Daily Report Cron] ⚠️ Update failed for user ${user.id}:`,
            updateError
          );
        }

        console.log(
          `[Daily Report Cron] ✅ Generated daily report for user ${user.id}`
        );
        results.push({ userId: user.id, status: 'success' });
      } catch (error) {
        console.error(
          `[Daily Report Cron] ❌ Error processing user ${user.id}:`,
          error
        );
        results.push({
          userId: user.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    // 4. Return summary
    const successCount = results.filter((r) => r.status === 'success').length;
    const failedCount = results.filter(
      (r) => r.status === 'failed' || r.status === 'error'
    ).length;

    console.log(
      `[Daily Report Cron] 🎉 Completed: ${successCount} success, ${failedCount} failed`
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
    console.error('[Daily Report Cron] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
