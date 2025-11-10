"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Sparkles, TrendingUp, Calendar, Shield } from "lucide-react";

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-purple-950 to-red-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
              <Sparkles className="h-6 w-6 text-yellow-400" />
              365일 사주
            </Link>

            {/* Navigation */}
            <nav className="hidden items-center gap-8 md:flex">
              <Link href="/" className="text-sm text-white/90 transition hover:text-white">
                홈
              </Link>
              <Link href="#features" className="text-sm text-white/90 transition hover:text-white">
                서비스
              </Link>
              <Link href="#pricing" className="text-sm text-white/90 transition hover:text-white">
                복채
              </Link>
              <Link href="#faq" className="text-sm text-white/90 transition hover:text-white">
                FAQ
              </Link>
            </nav>

            {isLoaded && (
              <div className="flex items-center gap-3">
                {isSignedIn ? (
                  <>
                    <Link
                      href="/new"
                      className="rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-yellow-600 hover:to-orange-600"
                    >
                      무료 체험하기
                    </Link>
                    <Link
                      href="/dashboard"
                      className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      대시보드
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/sign-in"
                      className="hidden rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:block"
                    >
                      로그인
                    </Link>
                    <Link
                      href="/sign-up"
                      className="rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-yellow-600 hover:to-orange-600"
                    >
                      무료로 시작하기
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-6 py-20 text-center">
        <div className="animate-gradient bg-gradient-to-r from-yellow-400 via-red-500 to-blue-500 bg-clip-text text-transparent">
          <h1 className="text-5xl font-bold md:text-6xl lg:text-7xl">
            당신의 사주, AI가 분석합니다
          </h1>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 md:text-xl">
          당신의 전 생애에 걸친 일간(日干) 일주를 매일 AI로 분석합니다
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:from-yellow-600 hover:to-orange-600"
            >
              대시보드로 이동
            </Link>
          ) : (
            <Link
              href="/sign-up"
              className="rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:from-yellow-600 hover:to-orange-600"
            >
              무료로 시작하기
            </Link>
          )}
        </div>
        <p className="mt-4 text-sm text-gray-400">
          🎁 무료 체험 3회 제공 | 월 ₩3,650 (하루 약 ₩120)
        </p>
      </section>

      {/* Features Section */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4 inline-flex rounded-lg bg-blue-500/10 p-3">
              <Sparkles className="h-8 w-8 text-blue-400" />
            </div>
            <h3 className="mb-3 text-xl font-bold text-white">AI 기반 정밀 분석</h3>
            <p className="text-gray-300">
              Google Gemini AI가 당신의 사주를 천간·지지 오행 해석부터 세밀하게 분석합니다
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4 inline-flex rounded-lg bg-purple-500/10 p-3">
              <Calendar className="h-8 w-8 text-purple-400" />
            </div>
            <h3 className="mb-3 text-xl font-bold text-white">매일 자동 리포트</h3>
            <p className="text-gray-300">
              유료 구독 시 매일 아침 오늘의 운세가 자동으로 생성됩니다
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4 inline-flex rounded-lg bg-orange-500/10 p-3">
              <TrendingUp className="h-8 w-8 text-orange-400" />
            </div>
            <h3 className="mb-3 text-xl font-bold text-white">합리적인 가격</h3>
            <p className="text-gray-300">
              월 ₩3,650 (하루 약 ₩120)으로 365일 운세를 받아보세요
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold text-white md:text-4xl">
          간편한 요금제
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          {/* Free Plan */}
          <div className="rounded-2xl border border-white/20 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-4">
              <h3 className="text-2xl font-bold text-white">무료 체험</h3>
              <div className="mt-2 text-4xl font-bold text-blue-400">₩0</div>
            </div>
            <ul className="mb-8 space-y-3 text-gray-300">
              <li className="flex items-start">
                <Shield className="mr-2 mt-1 h-5 w-5 text-blue-400" />
                <span>AI 사주 분석 3회 무료</span>
              </li>
              <li className="flex items-start">
                <Shield className="mr-2 mt-1 h-5 w-5 text-blue-400" />
                <span>Gemini Flash 모델 사용</span>
              </li>
              <li className="flex items-start">
                <Shield className="mr-2 mt-1 h-5 w-5 text-blue-400" />
                <span>기본 사주 분석 제공</span>
              </li>
            </ul>
            {isSignedIn ? (
              <Link
                href="/new"
                className="block w-full rounded-lg border-2 border-white/30 py-3 text-center font-semibold text-white transition hover:bg-white/10"
              >
                무료 체험 시작하기
              </Link>
            ) : (
              <Link
                href="/sign-up"
                className="block w-full rounded-lg border-2 border-white/30 py-3 text-center font-semibold text-white transition hover:bg-white/10"
              >
                무료 체험 시작
              </Link>
            )}
          </div>

          {/* Paid Plan */}
          <div className="relative rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 p-8 backdrop-blur-sm">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-1 text-xs font-bold text-white">
                RECOMMENDED
              </span>
            </div>
            <div className="mb-4">
              <h3 className="text-2xl font-bold text-white">365일 운세</h3>
              <div className="mt-2 text-4xl font-bold text-yellow-400">
                ₩3,650
                <span className="text-lg font-normal text-gray-300">/월</span>
              </div>
            </div>
            <ul className="mb-8 space-y-3 text-gray-300">
              <li className="flex items-start">
                <Sparkles className="mr-2 mt-1 h-5 w-5 text-yellow-400" />
                <span>매일 자동으로 생성되는 AI 운세</span>
              </li>
              <li className="flex items-start">
                <Sparkles className="mr-2 mt-1 h-5 w-5 text-yellow-400" />
                <span>Gemini Pro 모델로 정밀 분석</span>
              </li>
              <li className="flex items-start">
                <Sparkles className="mr-2 mt-1 h-5 w-5 text-yellow-400" />
                <span>세운·대운 해석 전체 공개</span>
              </li>
              <li className="flex items-start">
                <Sparkles className="mr-2 mt-1 h-5 w-5 text-yellow-400" />
                <span>언제든지 해지 가능</span>
              </li>
            </ul>
            {isSignedIn ? (
              <Link
                href="/subscription"
                className="block w-full rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 py-3 text-center font-bold text-white shadow-lg transition hover:from-yellow-600 hover:to-orange-600"
              >
                구독 시작하기
              </Link>
            ) : (
              <Link
                href="/sign-up"
                className="block w-full rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 py-3 text-center font-bold text-white shadow-lg transition hover:from-yellow-600 hover:to-orange-600"
              >
                무료 체험 후 구독
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold text-white md:text-4xl">
          자주 묻는 질문
        </h2>
        <div className="space-y-4">
          <details className="group rounded-xl border border-white/20 bg-white/5 p-6 backdrop-blur-sm">
            <summary className="cursor-pointer font-bold text-white">
              무료 체험은 어떻게 이용하나요?
            </summary>
            <p className="mt-3 text-gray-300">
              Google 계정으로 로그인하시면 자동으로 3회 무료 AI 사주 분석이 제공됩니다.
              별도의 결제 정보 없이 바로 체험하실 수 있습니다.
            </p>
          </details>

          <details className="group rounded-xl border border-white/20 bg-white/5 p-6 backdrop-blur-sm">
            <summary className="cursor-pointer font-bold text-white">
              구독은 언제든지 해지할 수 있나요?
            </summary>
            <p className="mt-3 text-gray-300">
              네, 언제든지 해지 가능합니다. 해지 후에도 다음 결제일까지는 서비스를 계속 이용하실 수 있습니다.
            </p>
          </details>

          <details className="group rounded-xl border border-white/20 bg-white/5 p-6 backdrop-blur-sm">
            <summary className="cursor-pointer font-bold text-white">
              AI 사주 분석은 어떤 모델을 사용하나요?
            </summary>
            <p className="mt-3 text-gray-300">
              무료 체험은 Google Gemini Flash 모델을, 유료 구독은 Gemini Pro 모델을 사용하여
              더 정밀하고 상세한 분석을 제공합니다.
            </p>
          </details>

          <details className="group rounded-xl border border-white/20 bg-white/5 p-6 backdrop-blur-sm">
            <summary className="cursor-pointer font-bold text-white">
              일일 리포트는 언제 생성되나요?
            </summary>
            <p className="mt-3 text-gray-300">
              유료 구독자는 매일 자정 이후 언제든지 오늘의 사주를 확인하실 수 있습니다.
              하루 1회 자동으로 생성됩니다.
            </p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/20 py-8">
        <div className="mx-auto max-w-7xl px-6 text-center text-sm text-gray-400">
          <p>© 2025 365일 사주. All rights reserved.</p>
          <p className="mt-2">
            AI 사주 분석은 재미와 참고용으로 제공되며, 법적 효력이 없습니다.
          </p>
        </div>
      </footer>
    </main>
  );
}
