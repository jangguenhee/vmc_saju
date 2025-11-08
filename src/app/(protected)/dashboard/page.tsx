"use client";

import Image from "next/image";
import { useUser } from "@clerk/nextjs";

type DashboardPageProps = {
  params: Promise<Record<string, never>>;
};

export default function DashboardPage({ params }: DashboardPageProps) {
  void params;
  const { user } = useUser();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">대시보드</h1>
        <p className="text-slate-500">
          {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? "알 수 없는 사용자"} 님, 환영합니다.
        </p>
      </header>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <Image
          alt="대시보드"
          src="https://picsum.photos/seed/dashboard/960/420"
          width={960}
          height={420}
          className="h-auto w-full object-cover"
        />
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-lg font-medium">현재 세션</h2>
          <p className="mt-2 text-sm text-slate-500">
            Clerk 미들웨어가 세션을 자동으로 관리합니다.
          </p>
        </article>
        <article className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-lg font-medium">보안 체크</h2>
          <p className="mt-2 text-sm text-slate-500">
            보호된 App Router 세그먼트로 라우팅되며, 로그인 사용자만 접근할 수 있습니다.
          </p>
        </article>
      </section>
    </div>
  );
}
