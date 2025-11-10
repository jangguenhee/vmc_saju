"use client";

import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Sparkles, Calendar, LogOut, TrendingUp, Clock } from "lucide-react";
import Link from "next/link";

interface SubscriptionStatus {
  plan: string;
  testsRemaining: number;
  nextBillingDate: string | null;
}

interface Analysis {
  id: string;
  type: string;
  created_at: string;
  input: {
    name: string;
    birthDate: string;
  };
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded) {
      fetchData();
    }
  }, [isLoaded]);

  const fetchData = async () => {
    try {
      // Fetch subscription status
      const statusRes = await fetch("/api/subscription/status");
      const statusData = await statusRes.json();
      if (statusData.success) {
        setStatus({
          plan: statusData.data.plan,
          testsRemaining: statusData.data.testsRemaining,
          nextBillingDate: statusData.data.nextBillingDate,
        });
      }

      // TODO: Fetch recent analyses
      // const analysesRes = await fetch("/api/analysis/history");
      // const analysesData = await analysesRes.json();
      // if (analysesData.success) {
      //   setAnalyses(analysesData.data);
      // }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-purple-950 to-red-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
            <Sparkles className="h-6 w-6 text-yellow-400" />
            365일 사주
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-sm text-white/90">
              {user?.primaryEmailAddress?.emailAddress}
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">대시보드</h1>
          <p className="mt-2 text-gray-300">
            {user?.fullName || user?.firstName || "회원"}님, 환영합니다!
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Status Card */}
          <div className="lg:col-span-2">
            {status?.plan === "free" ? (
              <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-900/40 to-indigo-900/40 backdrop-blur-sm p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-blue-100">
                      무료 체험 중
                    </h2>
                    <p className="mt-2 text-4xl font-bold text-blue-300">
                      남은 {status.testsRemaining}회
                    </p>
                    <p className="mt-4 text-sm text-blue-200">
                      무료 체험으로 AI 사주 분석을 {status.testsRemaining}회 더 받아보실 수 있습니다.
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-500/20 px-4 py-2 text-sm font-bold text-blue-200 border border-blue-400/30">
                    FREE
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/new"
                    className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-bold text-white shadow-lg transition hover:from-blue-700 hover:to-indigo-700"
                  >
                    <Sparkles className="h-5 w-5" />
                    AI 사주 분석 시작하기
                  </Link>
                  <Link
                    href="/subscription"
                    className="flex items-center justify-center gap-2 rounded-lg border-2 border-blue-400 bg-white/10 backdrop-blur-sm px-6 py-3 font-bold text-blue-200 transition hover:bg-white/20"
                  >
                    365일 운세 구독하기
                  </Link>
                </div>
              </div>
            ) : status?.plan === "paid" ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/40 to-orange-900/40 backdrop-blur-sm p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-yellow-100">
                      365일 운세 구독 중
                    </h2>
                    <p className="mt-2 text-4xl font-bold text-yellow-300">
                      월 ₩3,650
                    </p>
                    {status.nextBillingDate && (
                      <p className="mt-4 text-sm text-yellow-200">
                        다음 결제일: {new Date(status.nextBillingDate).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                  </div>
                  <div className="rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-4 py-2 text-sm font-bold text-orange-200 border border-yellow-400/30">
                    PREMIUM
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/new"
                    className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-3 font-bold text-white shadow-lg transition hover:from-yellow-600 hover:to-orange-600"
                  >
                    <Calendar className="h-5 w-5" />
                    오늘의 사주 보기
                  </Link>
                  <Link
                    href="/subscription"
                    className="flex items-center justify-center gap-2 rounded-lg border-2 border-yellow-400 bg-white/10 backdrop-blur-sm px-6 py-3 font-bold text-yellow-200 transition hover:bg-white/20"
                  >
                    구독 관리
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
                <p className="text-gray-300">구독 정보를 불러오는 중...</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
              <h3 className="mb-4 font-bold text-white">빠른 메뉴</h3>
              <div className="space-y-3">
                <Link
                  href="/new"
                  className="flex items-center gap-3 rounded-lg border border-white/10 p-3 transition hover:bg-white/10"
                >
                  <Sparkles className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="font-medium text-white">새 분석</div>
                    <div className="text-xs text-gray-400">AI 사주 분석</div>
                  </div>
                </Link>
                <Link
                  href="/subscription"
                  className="flex items-center gap-3 rounded-lg border border-white/10 p-3 transition hover:bg-white/10"
                >
                  <TrendingUp className="h-5 w-5 text-yellow-400" />
                  <div>
                    <div className="font-medium text-white">구독 관리</div>
                    <div className="text-xs text-gray-400">플랜 변경</div>
                  </div>
                </Link>
              </div>
            </div>

            {status?.plan === "paid" && (
              <div className="rounded-2xl border border-green-500/30 bg-green-900/30 backdrop-blur-sm p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-green-500/20 p-2 border border-green-400/30">
                    <Calendar className="h-5 w-5 text-green-300" />
                  </div>
                  <div>
                    <h4 className="font-bold text-green-100">일일 리포트</h4>
                    <p className="mt-1 text-sm text-green-200">
                      매일 아침 자동으로 오늘의 운세가 생성됩니다
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Analyses */}
        <div className="mt-12">
          <h2 className="mb-6 text-2xl font-bold text-white">최근 분석</h2>
          {analyses.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {analyses.map((analysis) => (
                <Link
                  key={analysis.id}
                  href={`/analysis/${analysis.id}`}
                  className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 transition hover:border-blue-400/50 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-white">
                        {analysis.input.name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-400">
                        {analysis.input.birthDate}
                      </p>
                    </div>
                    <div className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300 border border-blue-400/30">
                      {analysis.type === "free" ? "무료" : "프리미엄"}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="h-4 w-4" />
                    {new Date(analysis.created_at).toLocaleDateString("ko-KR")}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/5 backdrop-blur-sm p-12 text-center">
              <Sparkles className="mx-auto h-12 w-12 text-gray-500" />
              <p className="mt-4 text-gray-300">아직 분석 내역이 없습니다</p>
              <p className="mt-2 text-sm text-gray-400">
                첫 AI 사주 분석을 시작해보세요
              </p>
              <Link
                href="/new"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-bold text-white shadow-lg transition hover:from-blue-700 hover:to-indigo-700"
              >
                <Sparkles className="h-5 w-5" />
                분석 시작하기
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
