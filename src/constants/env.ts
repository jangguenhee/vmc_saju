import { z } from 'zod';

// Client-side environment variables (exposed to browser)
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// Server-side environment variables (not exposed to browser)
const serverEnvSchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TOSS_SECRET_KEY: z.string().min(1),
  TOSS_WEBHOOK_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_FLASH_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_PRO_MODEL: z.string().min(1).default("gemini-2.5-pro"),
  CRON_SECRET: z.string().min(1),
});

const _clientEnv = clientEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

const _serverEnv = serverEnvSchema.safeParse({
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY,
  TOSS_WEBHOOK_SECRET: process.env.TOSS_WEBHOOK_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_FLASH_MODEL: process.env.GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL: process.env.GEMINI_PRO_MODEL,
  CRON_SECRET: process.env.CRON_SECRET,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type Env = ClientEnv & ServerEnv;

if (!_clientEnv.success) {
  console.error('클라이언트 환경 변수 검증 실패:', _clientEnv.error.flatten().fieldErrors);
  throw new Error('클라이언트 환경 변수를 확인하세요.');
}

if (!_serverEnv.success) {
  console.error('서버 환경 변수 검증 실패:', _serverEnv.error.flatten().fieldErrors);
  throw new Error('서버 환경 변수를 확인하세요.');
}

export const env: Env = { ..._clientEnv.data, ..._serverEnv.data };
