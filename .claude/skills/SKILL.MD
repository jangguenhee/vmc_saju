---
name: saju-saas-builder
description: >
  Comprehensive development guide for building a subscription-based AI Saju (Korean fortune-telling) SaaS application. 
  Use this skill when developing the 365일 사주 web app with Next.js, Clerk authentication, Supabase database, 
  TossPayments subscription billing, and Gemini AI analysis. Includes complete API specifications, database schemas, 
  AI prompt strategies, and automation scripts for the full development lifecycle.
---

# Saju SaaS Builder Skill

This skill provides complete guidance for building **365일 사주** - a subscription-based AI-powered Korean fortune-telling (Saju/사주팔자) SaaS application.

## Overview

### Service Flow
```
Landing Page → Google Login (Clerk) → Dashboard → 
→ Free Trial (3x) → AI Analysis (Gemini) → 
→ Subscribe (₩3,650/month) → Daily Reports → Renewal (TossPayments)
```

### Tech Stack
- **Frontend**: Next.js 14+ (App Router), React, TailwindCSS
- **Authentication**: Clerk SDK (Google OAuth)
- **Database**: Supabase (PostgreSQL + RLS + Cron)
- **Payments**: TossPayments SDK (Subscription Billing)
- **AI**: Google Gemini API (`gemini-2.5-flash` / `gemini-2.5-pro`)
- **Deployment**: Vercel

---

## Quick Start Checklist

Before starting development, ensure you have:

- [ ] Supabase project created
- [ ] Clerk application configured (Google OAuth enabled)
- [ ] TossPayments account with test keys
- [ ] Gemini API key
- [ ] Vercel account for deployment

Run the integration test:
```bash
./scripts/test_integrations.sh
```

---

## Core Development Workflow

### Phase 1: Environment Setup

1. **Initialize Next.js Project**
```bash
npx create-next-app@latest vcm-saju --typescript --tailwind --app
cd vcm-saju
```

2. **Install Dependencies**
```bash
npm install @clerk/nextjs @supabase/supabase-js @google/generative-ai
npm install -D @types/node
```

3. **Configure Environment Variables**
Create `.env.local` with all required keys (see `references/api-spec.md` for complete list)

4. **Setup Database**
- Copy SQL from `references/database-schema.md`
- Run in Supabase SQL Editor
- Enable Row Level Security (RLS)
- Configure cron jobs

5. **Verify Integration**
```bash
./scripts/test_integrations.sh
```

---

### Phase 2: Core Features Implementation

#### Authentication (Clerk)

**Implementation Priority: HIGH**

1. Wrap app in `<ClerkProvider>` (app/layout.tsx)
2. Create `/api/webhooks/clerk` route for user sync
3. Implement middleware for protected routes
4. Add `<UserButton />` to header

**Reference**: Clerk docs + `references/api-spec.md` section "Authentication Webhooks"

#### Database Layer (Supabase)

**Implementation Priority: HIGH**

1. Create `lib/supabase.ts` client utilities
2. Implement CRUD operations for:
   - User management
   - Analysis history
   - Payment logging
3. Setup RLS policies
4. Test with Supabase client

**Reference**: `references/database-schema.md`

#### AI Analysis (Gemini)

**Implementation Priority: HIGH**

1. Create `lib/gemini.ts` for API calls
2. Implement prompt templates (Free vs Pro tier)
3. Add retry logic with exponential backoff
4. Validate response format

**Critical Details**: See `references/prompts.md` for:
- System instructions
- User prompt templates
- Response validation
- Error handling

#### Payment Integration (TossPayments)

**Implementation Priority: MEDIUM**

1. Create `/api/subscription/create` endpoint
2. Implement billing key storage
3. Setup webhook handler `/api/webhooks/toss`
4. Create subscription management UI

**Reference**: `references/api-spec.md` section "Payment Webhooks"

---

### Phase 3: Pages & UI

#### Priority Order:
1. `/` - Landing page with Google OAuth CTA
2. `/dashboard` - User hub (plan status + history)
3. `/new` - AI analysis request form
4. `/analysis/[id]` - Result display
5. `/subscription` - Payment management

#### Design Guidelines:
- Use **오방색 (Five Colors)** theme: 청(blue), 적(red), 황(yellow), 백(white), 흑(black)
- Implement smooth loading states during AI analysis
- Mobile-first responsive design
- Clear CTA placement for free → paid conversion

---

## Key Implementation Patterns

### 1. Free Trial Management

```typescript
// Before AI analysis
const user = await supabase
  .from('users')
  .select('tests_remaining, plan')
  .eq('id', userId)
  .single();

if (user.plan === 'free' && user.tests_remaining <= 0) {
  // Redirect to /subscription
  return { error: 'FREE_TRIAL_EXHAUSTED' };
}

// After successful analysis (free users only)
if (user.plan === 'free') {
  await supabase
    .from('users')
    .update({ tests_remaining: user.tests_remaining - 1 })
    .eq('id', userId);
}
```

### 2. Daily Report Generation (Cron)

```typescript
// /api/cron/daily-report
export async function POST(req: Request) {
  // Verify cron secret
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get Pro users needing today's report
  const users = await supabase
    .from('users')
    .select('*')
    .eq('plan', 'paid')
    .lt('last_daily_report_date', new Date().toISOString().split('T')[0]);

  for (const user of users.data || []) {
    await generateDailyReport(user);
  }

  return Response.json({ processed: users.data?.length || 0 });
}
```

### 3. Webhook Verification

```typescript
// TossPayments webhook
import crypto from 'crypto';

function verifyTossSignature(payload: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.TOSS_WEBHOOK_SECRET!)
    .update(payload)
    .digest('base64');
  
  return hash === signature;
}
```

---

## Testing Strategy

### Unit Tests
- Gemini prompt generation
- Payment calculations
- Date/time utilities

### Integration Tests
Run `./scripts/test_integrations.sh` to verify:
- Clerk authentication flow
- Supabase connection
- TossPayments API
- Gemini API

### E2E Test Scenarios
1. New user signup → 3 free analyses → subscribe
2. Paid user → daily report generation
3. Payment failure → suspension → recovery
4. Subscription cancellation → grace period

---

## Common Pitfalls & Solutions

### Issue: Webhook Not Received
**Solution**: 
- Check Vercel deployment URL is HTTPS
- Verify webhook secrets in Clerk/Toss dashboards
- Use webhook testing tools (webhook.site)

### Issue: Gemini API Timeout
**Solution**:
- Implement retry with exponential backoff (see `references/prompts.md`)
- Use streaming for Pro tier
- Set longer timeout for Vercel functions (60s)

### Issue: Cron Job Not Triggering
**Solution**:
- Verify Supabase cron is enabled
- Check timezone settings (KST = UTC+9)
- Test cron endpoint manually first

### Issue: RLS Policy Blocking Queries
**Solution**:
- Use service role key for server-side operations
- Review RLS policies in `references/database-schema.md`
- Test with different user contexts

---

## Progressive Enhancement Roadmap

### MVP (Launch)
- ✅ Google OAuth login
- ✅ 3x free trial
- ✅ Basic AI analysis (Flash model)
- ✅ Subscription payment (₩3,650/month)
- ✅ Daily reports (Pro model)

### V1.1 (Post-Launch)
- Email notifications for payment events
- Kakao login integration
- Lunar calendar support
- Analysis history export (PDF)

### V1.2 (Growth)
- Referral program
- Multiple subscription tiers
- Advanced AI features (compatibility analysis)
- Mobile app (React Native)

---

## File Organization

```
vcm-saju/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── dashboard/page.tsx
│   ├── new/page.tsx
│   ├── analysis/[id]/page.tsx
│   ├── subscription/page.tsx
│   └── api/
│       ├── webhooks/
│       │   ├── clerk/route.ts
│       │   └── toss/route.ts
│       ├── analysis/
│       │   └── generate/route.ts
│       ├── subscription/
│       │   ├── create/route.ts
│       │   └── cancel/route.ts
│       └── cron/
│           ├── billing/route.ts
│           └── daily-report/route.ts
├── lib/
│   ├── supabase.ts
│   ├── gemini.ts
│   ├── toss.ts
│   └── utils.ts
├── components/
│   ├── Header.tsx
│   ├── PlanBadge.tsx
│   ├── AnalysisCard.tsx
│   └── SubscriptionButton.tsx
└── .env.local
```

---

## Critical References

When implementing specific features, **always read these references first**:

| Feature | Reference File | Key Sections |
|---------|---------------|--------------|
| **API Routes** | `references/api-spec.md` | All endpoints, webhooks, cron jobs |
| **Database** | `references/database-schema.md` | Tables, RLS policies, queries |
| **AI Analysis** | `references/prompts.md` | Prompt templates, validation, retry logic |

---

## Deployment Checklist

Before deploying to Vercel:

- [ ] All environment variables configured in Vercel dashboard
- [ ] Webhook URLs updated in Clerk/TossPayments
- [ ] Supabase RLS policies enabled
- [ ] Cron jobs scheduled in Supabase
- [ ] Test webhook endpoints with production keys
- [ ] Verify Gemini API quota limits
- [ ] Setup error monitoring (Sentry/LogRocket)
- [ ] Configure custom domain (optional)

---

## Getting Help

If stuck on implementation:

1. **Check references first**: Most answers are in `references/` files
2. **Review requirement.md**: Confirms expected behavior
3. **Test integrations**: Run `./scripts/test_integrations.sh`
4. **Isolate the issue**: Test each service independently

---

## Summary

This skill provides everything needed to build a production-ready AI Saju SaaS:

- Complete API specifications
- Database schemas with RLS
- AI prompt engineering strategies
- Payment subscription flow
- Automation scripts
- Testing guidelines

Follow the **Core Development Workflow** phase by phase, referring to the detailed references as needed. The goal is a seamless user journey from free trial to paid subscription with reliable daily AI reports.

**Start with Phase 1 (Environment Setup) and progress sequentially for best results.**