"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import Link from "next/link";
import { Sparkles, ArrowLeft, LogOut, Shield, Calendar, TrendingUp } from "lucide-react";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";
const MONTHLY_PRICE = 3650;

type UserSubscription = {
  plan: "free" | "paid" | "cancelled" | "suspended";
  tests_remaining: number;
  next_billing_date?: string;
  billing_key?: string;
};

export default function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription>({
    plan: "free",
    tests_remaining: 3,
  });

  useEffect(() => {
    fetchSubscription();

    // Handle success/error from payment redirect
    const success = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (success === "true") {
      setError(null);
      alert("구독이 성공적으로 시작되었습니다!");
      // Clear query params
      router.replace("/subscription");
    } else if (errorParam) {
      const message = searchParams.get("message");
      setError(message || "결제 처리 중 오류가 발생했습니다.");
    }
  }, [searchParams]);

  const fetchSubscription = async () => {
    try {
      const response = await fetch("/api/subscription/status");
      const data = await response.json();

      if (data.success) {
        setSubscription({
          plan: data.data.plan,
          tests_remaining: data.data.testsRemaining,
          next_billing_date: data.data.nextBillingDate,
          billing_key: data.data.billingKey,
        });
      } else {
        setError(data.message || "구독 정보를 불러올 수 없습니다.");
      }
    } catch (error) {
      console.error("구독 정보 로딩 실패:", error);
      setError("구독 정보를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load TossPayments SDK
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

      // Generate order ID
      const orderId = `${user?.id || "user"}_${Date.now()}`;
      const successUrl = `${window.location.origin}/api/payments/success`;
      const failUrl = `${window.location.origin}/api/payments/fail`;

      // Open payment widget
      await tossPayments.requestPayment("카드", {
        amount: MONTHLY_PRICE,
        orderId,
        orderName: "365일 사주 월 구독",
        successUrl,
        failUrl,
        customerName: user?.fullName || "고객",
      });
    } catch (error: any) {
      console.error("구독 시작 실패:", error);
      setError(error.message || "구독 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("정말로 구독을 해지하시겠습니까? 다음 결제일까지 혜택이 유지됩니다.")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/subscription/cancel", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        alert(data.message);
        fetchSubscription(); // Refresh status
      } else {
        setError(data.message || "구독 해지 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("구독 해지 실패:", error);
      setError("구독 해지 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryPayment = async () => {
    try {
      // TODO: API 연동
      alert("재결제를 시도합니다.");
    } catch (error) {
      console.error("재결제 실패:", error);
      alert("재결제 처리 중 오류가 발생했습니다.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-950 via-purple-950 to-red-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-yellow-400" />
      </div>
    );
  }

  const getDaysUntilBilling = () => {
    if (!subscription.next_billing_date) return 0;
    const nextDate = new Date(subscription.next_billing_date);
    const today = new Date();
    const diff = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

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
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              대시보드
            </Link>
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
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white">구독 관리</h1>
          <p className="mt-2 text-gray-300">
            365일 운세 구독 상태를 확인하고 관리하세요
          </p>

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-900/30 p-4 backdrop-blur-sm">
              <p className="text-sm font-medium text-red-200">{error}</p>
            </div>
          )}
        </header>

        {/* 상단 정보 카드 */}
        <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur-sm">
          {subscription.plan === "free" ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    현재 플랜: 무료 체험
                  </h2>
                  <p className="mt-2 text-2xl font-bold text-blue-300">
                    남은 분석 {subscription.tests_remaining}회
                  </p>
                </div>
                <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-200">
                  FREE
                </span>
              </div>
              <p className="mt-4 text-sm text-gray-300">
                365일 AI 운세 구독으로 매일의 리포트를 받아보세요
              </p>
              <div className="mt-6 rounded-lg border border-yellow-500/30 bg-gradient-to-r from-yellow-900/40 to-orange-900/40 p-4 backdrop-blur-sm">
                <p className="text-sm font-medium text-yellow-100">
                  월 ₩3,650으로 매일 AI 사주 리포트 받기
                </p>
                <ul className="mt-2 space-y-1 text-xs text-yellow-200">
                  <li className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    매일 자동으로 오늘의 운세 생성
                  </li>
                  <li className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3" />
                    Gemini Pro 모델로 정밀 분석
                  </li>
                  <li className="flex items-center gap-2">
                    <TrendingUp className="h-3 w-3" />
                    세운·대운 해석 전체 공개
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="h-3 w-3" />
                    언제든지 해지 가능
                  </li>
                </ul>
              </div>
              <button
                onClick={handleSubscribe}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-3 font-semibold text-white shadow-lg hover:from-yellow-600 hover:to-orange-600"
              >
                <Sparkles className="h-5 w-5" />
                365일 운세 시작하기
              </button>
            </div>
          ) : subscription.plan === "paid" ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    현재 플랜: 365일 운세
                  </h2>
                  <p className="mt-2 text-2xl font-bold text-yellow-300">
                    월 ₩3,650
                  </p>
                </div>
                <span className="rounded-full border border-yellow-400/30 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-3 py-1 text-xs font-medium text-orange-200">
                  PREMIUM
                </span>
              </div>
              {subscription.next_billing_date && (
                <div className="mt-4 space-y-1 text-sm text-gray-300">
                  <p>
                    다음 결제일:{" "}
                    <span className="font-medium text-white">
                      {new Date(subscription.next_billing_date).toLocaleDateString("ko-KR")}
                    </span>
                  </p>
                  <p>
                    잔여 분석일:{" "}
                    <span className="font-medium text-white">
                      오늘 포함 {getDaysUntilBilling()}일 남음
                    </span>
                  </p>
                </div>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleCancelSubscription}
                  className="flex-1 rounded-md border-2 border-red-500/50 bg-red-900/30 px-4 py-2.5 text-sm font-medium text-red-200 backdrop-blur-sm hover:bg-red-900/50"
                >
                  구독 해지하기
                </button>
                <button
                  onClick={() => router.push("/subscription/history")}
                  className="flex-1 rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20"
                >
                  결제 이력 보기
                </button>
              </div>
            </div>
          ) : subscription.plan === "cancelled" ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    구독 해지 예정
                  </h2>
                  <p className="mt-2 text-sm text-gray-300">
                    {subscription.next_billing_date &&
                      `${new Date(subscription.next_billing_date).toLocaleDateString("ko-KR")}까지 혜택이 유지됩니다`}
                  </p>
                </div>
                <span className="rounded-full border border-gray-400/30 bg-gray-500/20 px-3 py-1 text-xs font-medium text-gray-300">
                  CANCELLED
                </span>
              </div>
              <button
                onClick={handleSubscribe}
                className="mt-6 w-full rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-blue-700 hover:to-indigo-700"
              >
                다시 구독하기
              </button>
            </div>
          ) : (
            <div>
              <div className="rounded-lg border border-red-500/30 bg-red-900/30 p-4 backdrop-blur-sm">
                <p className="text-sm font-medium text-red-200">
                  ⚠️ 결제 실패 – 카드 상태를 확인해주세요
                </p>
                <p className="mt-1 text-xs text-red-300">
                  결제에 실패하여 서비스가 일시 중지되었습니다.
                </p>
              </div>
              <button
                onClick={handleRetryPayment}
                className="mt-6 w-full rounded-md bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700"
              >
                재결제 시도
              </button>
            </div>
          )}
        </div>

        {/* 정기결제 안내 */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h3 className="font-semibold text-white">정기결제 안내</h3>
          <ul className="mt-4 space-y-2 text-sm text-gray-300">
            <li className="flex items-start">
              <span className="mr-2 text-blue-400">•</span>
              <span>매월 1회 자동 결제됩니다 (₩3,650)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-blue-400">•</span>
              <span>해지 시 다음 결제일까지 서비스가 유지됩니다</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-blue-400">•</span>
              <span>재구독 시 새로운 결제 정보를 등록해야 합니다</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-blue-400">•</span>
              <span>결제 실패 시 이메일과 앱 내 알림을 통해 안내해드립니다</span>
            </li>
          </ul>
        </div>

        {/* 하단 버튼 */}
        <div className="mt-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
