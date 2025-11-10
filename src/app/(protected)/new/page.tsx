"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { Sparkles, ArrowLeft, LogOut } from "lucide-react";

export default function NewAnalysisPage() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    birthDate: "",
    birthTime: "",
    gender: "" as "male" | "female" | "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.birthDate || !formData.gender) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }

    setLoading(true);

    // 로딩 메시지 순차 표시
    const messages = [
      "천간과 지지를 해석하는 중입니다…",
      "오행의 균형을 분석하고 있습니다…",
      "오늘의 운세를 정리하는 중입니다…",
    ];

    let messageIndex = 0;
    setLoadingMessage(messages[0]);

    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      setLoadingMessage(messages[messageIndex]);
    }, 3000);

    try {
      const response = await fetch('/api/analysis/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      clearInterval(messageInterval);

      if (!response.ok || !result.success) {
        // Handle specific errors
        if (result.error === 'FREE_TRIAL_EXHAUSTED') {
          alert(result.message);
          router.push('/subscription');
          return;
        }

        if (result.error === 'DAILY_LIMIT_REACHED') {
          alert(result.message);
          router.push('/dashboard');
          return;
        }

        throw new Error(result.message || 'AI 분석 생성 실패');
      }

      // Success - redirect to analysis result page
      router.push(`/analysis/${result.data.id}`);
    } catch (error) {
      console.error('분석 요청 실패:', error);
      alert(error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      clearInterval(messageInterval);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
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
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">오늘의 사주</h1>
          <p className="mt-2 text-gray-300">
            AI가 당신의 사주를 분석합니다
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-12 shadow-lg">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-yellow-400" />
            <p className="text-center text-lg font-medium text-white">
              {loadingMessage}
            </p>
            <div className="h-2 w-64 overflow-hidden rounded-full bg-white/10">
              <div className="h-full animate-progress bg-gradient-to-r from-yellow-400 to-orange-400" />
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="w-full space-y-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 shadow-lg"
          >
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-white">
                이름 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-gray-400 backdrop-blur-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                placeholder="홍길동"
                required
              />
            </div>

            <div>
              <label htmlFor="birthDate" className="block text-sm font-medium text-white">
                생년월일 <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                id="birthDate"
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="mt-1 block w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-white backdrop-blur-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                required
              />
            </div>

            <div>
              <label htmlFor="birthTime" className="block text-sm font-medium text-white">
                출생시간 <span className="text-gray-400">(선택)</span>
              </label>
              <input
                type="time"
                id="birthTime"
                value={formData.birthTime}
                onChange={(e) => setFormData({ ...formData, birthTime: e.target.value })}
                className="mt-1 block w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-white backdrop-blur-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
              <p className="mt-1 text-xs text-gray-400">
                출생시간을 모르시면 비워두셔도 됩니다
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white">
                성별 <span className="text-red-400">*</span>
              </label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={formData.gender === "male"}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as "male" })}
                    className="h-4 w-4 border-white/20 text-yellow-400 focus:ring-yellow-400"
                    required
                  />
                  <span className="ml-2 text-sm text-white">남성</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={formData.gender === "female"}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as "female" })}
                    className="h-4 w-4 border-white/20 text-yellow-400 focus:ring-yellow-400"
                  />
                  <span className="ml-2 text-sm text-white">여성</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !formData.name || !formData.birthDate || !formData.gender}
              className="w-full rounded-md bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-3 font-bold text-white shadow-lg transition-all hover:from-yellow-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:from-gray-600 disabled:to-gray-700"
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI 사주 분석 시작하기
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
