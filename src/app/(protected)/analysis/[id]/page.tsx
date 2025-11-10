"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { Sparkles, ArrowLeft, LogOut, Share2, Calendar, User, TrendingUp, Heart, Wallet, Briefcase, AlertTriangle, Star } from "lucide-react";

type FortuneAspect = {
  score: number;
  advice: string;
};

type AnalysisJSON = {
  overall_score?: number;
  fortune_aspects?: {
    career?: FortuneAspect;
    wealth?: FortuneAspect;
    health?: FortuneAspect;
    relationship?: FortuneAspect;
  };
  lucky_elements?: string[];
  warnings?: string[];
};

type AnalysisData = {
  id: string;
  input: {
    name: string;
    birthDate: string;
    birthTime?: string;
    gender: "male" | "female";
  };
  output_markdown: string;
  output_json?: AnalysisJSON;
  created_at: string;
  type: "free" | "daily";
};

export default function AnalysisDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [userPlan, setUserPlan] = useState<"free" | "paid">("free");
  const [testsRemaining, setTestsRemaining] = useState(0);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const response = await fetch(`/api/analysis/${params.id}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || '분석 결과를 불러올 수 없습니다.');
        }

        setAnalysis({
          id: data.data.id,
          input: data.data.input,
          output_markdown: data.data.output_markdown,
          output_json: data.data.output_json,
          created_at: data.data.created_at,
          type: data.data.type,
        });
        setUserPlan(data.user.plan);
        setTestsRemaining(data.user.testsRemaining || 0);
      } catch (error) {
        console.error("분석 결과 로딩 실패:", error);
        alert("분석 결과를 불러오는데 실패했습니다.");
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [params.id, router]);

  const handleShare = () => {
    // TODO: 공유 기능 구현
    alert("공유 기능은 추후 구현 예정입니다.");
  };

  const handleNewAnalysis = () => {
    if (userPlan === "free" && testsRemaining <= 0) {
      router.push("/subscription");
    } else {
      router.push("/new");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Remove JSON code blocks from markdown
  const cleanMarkdown = (markdown: string) => {
    // Remove ```json ... ``` blocks
    return markdown.replace(/```json\s*\n[\s\S]*?\n```/g, '').trim();
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-orange-400";
  };

  // Get score bg color
  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "from-green-500/20 to-emerald-500/20 border-green-500/30";
    if (score >= 60) return "from-yellow-500/20 to-orange-500/20 border-yellow-500/30";
    return "from-orange-500/20 to-red-500/20 border-orange-500/30";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-950 via-purple-950 to-red-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-yellow-400" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-950 via-purple-950 to-red-950">
        <div className="text-center">
          <p className="text-lg text-white">분석 결과를 찾을 수 없습니다.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white hover:from-blue-700 hover:to-indigo-700"
          >
            대시보드로 돌아가기
          </button>
        </div>
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
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* 상단 정보 패널 */}
        <div className="sticky top-0 z-10 mb-8 rounded-xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">사주 분석 결과</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-300">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {analysis.input.name}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {analysis.input.birthDate}
                </span>
                {analysis.input.birthTime && <span>출생시간: {analysis.input.birthTime}</span>}
                <span>성별: {analysis.input.gender === "male" ? "남성" : "여성"}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                분석일: {new Date(analysis.created_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
              analysis.type === "free"
                ? "border-blue-400/30 bg-blue-500/20 text-blue-200"
                : "border-yellow-400/30 bg-yellow-500/20 text-yellow-200"
            }`}>
              {analysis.type === "free" ? "무료" : "프리미엄"}
            </span>
          </div>

          {/* 구독 상태 배너 */}
          {userPlan === "free" ? (
            <div className="rounded-lg border border-blue-500/30 bg-blue-900/30 p-4 backdrop-blur-sm">
              <p className="text-sm font-medium text-blue-200">
                무료 체험 중 – 남은 분석 {testsRemaining}회
              </p>
              <p className="mt-1 text-xs text-blue-300">
                AI가 당신의 하루를 해석합니다. 365일 운세 구독으로 매일 받아보세요 (월 3,650원)
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-yellow-500/30 bg-gradient-to-r from-yellow-900/30 to-orange-900/30 p-4 backdrop-blur-sm">
              <p className="text-sm font-medium text-yellow-200">
                365일 운세 구독 중 – 오늘의 리포트
              </p>
              <p className="mt-1 text-xs text-yellow-300">
                다음 분석 가능일: 내일 00:00 이후
              </p>
            </div>
          )}
        </div>

        {/* JSON 데이터 시각화 */}
        {analysis.output_json && (
          <div className="mb-8 space-y-6">
            {/* Overall Score */}
            {analysis.output_json.overall_score !== undefined && (
              <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/40 to-orange-900/40 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">종합 운세</h3>
                    <p className="text-sm text-gray-300">오늘의 전체 운세 점수</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-4xl font-bold ${getScoreColor(analysis.output_json.overall_score)}`}>
                      {analysis.output_json.overall_score}
                    </div>
                    <div className="text-sm text-gray-400">/ 100</div>
                  </div>
                </div>
              </div>
            )}

            {/* Fortune Aspects */}
            {analysis.output_json.fortune_aspects && (
              <div className="grid gap-4 md:grid-cols-2">
                {/* Career */}
                {analysis.output_json.fortune_aspects.career && (
                  <div className={`rounded-xl border bg-gradient-to-br p-5 backdrop-blur-sm ${getScoreBgColor(analysis.output_json.fortune_aspects.career.score)}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-blue-400" />
                        <h4 className="font-semibold text-white">직업운</h4>
                      </div>
                      <span className={`text-2xl font-bold ${getScoreColor(analysis.output_json.fortune_aspects.career.score)}`}>
                        {analysis.output_json.fortune_aspects.career.score}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200">{analysis.output_json.fortune_aspects.career.advice}</p>
                  </div>
                )}

                {/* Wealth */}
                {analysis.output_json.fortune_aspects.wealth && (
                  <div className={`rounded-xl border bg-gradient-to-br p-5 backdrop-blur-sm ${getScoreBgColor(analysis.output_json.fortune_aspects.wealth.score)}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-green-400" />
                        <h4 className="font-semibold text-white">재물운</h4>
                      </div>
                      <span className={`text-2xl font-bold ${getScoreColor(analysis.output_json.fortune_aspects.wealth.score)}`}>
                        {analysis.output_json.fortune_aspects.wealth.score}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200">{analysis.output_json.fortune_aspects.wealth.advice}</p>
                  </div>
                )}

                {/* Health */}
                {analysis.output_json.fortune_aspects.health && (
                  <div className={`rounded-xl border bg-gradient-to-br p-5 backdrop-blur-sm ${getScoreBgColor(analysis.output_json.fortune_aspects.health.score)}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Heart className="h-5 w-5 text-red-400" />
                        <h4 className="font-semibold text-white">건강운</h4>
                      </div>
                      <span className={`text-2xl font-bold ${getScoreColor(analysis.output_json.fortune_aspects.health.score)}`}>
                        {analysis.output_json.fortune_aspects.health.score}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200">{analysis.output_json.fortune_aspects.health.advice}</p>
                  </div>
                )}

                {/* Relationship */}
                {analysis.output_json.fortune_aspects.relationship && (
                  <div className={`rounded-xl border bg-gradient-to-br p-5 backdrop-blur-sm ${getScoreBgColor(analysis.output_json.fortune_aspects.relationship.score)}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-purple-400" />
                        <h4 className="font-semibold text-white">대인관계운</h4>
                      </div>
                      <span className={`text-2xl font-bold ${getScoreColor(analysis.output_json.fortune_aspects.relationship.score)}`}>
                        {analysis.output_json.fortune_aspects.relationship.score}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200">{analysis.output_json.fortune_aspects.relationship.advice}</p>
                  </div>
                )}
              </div>
            )}

            {/* Lucky Elements */}
            {analysis.output_json.lucky_elements && analysis.output_json.lucky_elements.length > 0 && (
              <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-900/30 to-emerald-900/30 p-5 backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-400" />
                  <h4 className="font-semibold text-white">행운의 요소</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.output_json.lucky_elements.map((element, index) => (
                    <span
                      key={index}
                      className="rounded-full border border-green-400/30 bg-green-500/20 px-3 py-1 text-sm text-green-200"
                    >
                      {element}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {analysis.output_json.warnings && analysis.output_json.warnings.length > 0 && (
              <div className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-900/30 to-red-900/30 p-5 backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  <h4 className="font-semibold text-white">주의사항</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.output_json.warnings.map((warning, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-gray-200">
                      <span className="mt-1 text-orange-400">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 본문 - Markdown 렌더링 */}
        <article className="prose prose-invert prose-slate max-w-none rounded-xl border border-white/10 bg-white/5 p-8 shadow-lg backdrop-blur-sm">
          <ReactMarkdown
            components={{
              h1: ({node, ...props}) => <h1 className="text-white" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-white" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-white" {...props} />,
              p: ({node, ...props}) => <p className="text-gray-200" {...props} />,
              strong: ({node, ...props}) => <strong className="text-yellow-300" {...props} />,
              li: ({node, ...props}) => <li className="text-gray-200" {...props} />,
              code: ({node, className, children, ...props}) => {
                // Hide JSON code blocks
                const isJsonBlock = className === 'language-json';
                if (isJsonBlock) return null;
                return <code className={className} {...props}>{children}</code>;
              },
              pre: ({node, children, ...props}) => {
                // Hide pre tags containing JSON code blocks
                const codeChild = node?.children?.[0];
                if (codeChild && 'tagName' in codeChild && codeChild.tagName === 'code') {
                  const codeProps = codeChild.properties;
                  if (codeProps && 'className' in codeProps) {
                    const classNames = codeProps.className;
                    if (Array.isArray(classNames) && classNames.includes('language-json')) {
                      return null;
                    }
                  }
                }
                return <pre {...props}>{children}</pre>;
              },
            }}
          >
            {cleanMarkdown(analysis.output_markdown)}
          </ReactMarkdown>
        </article>

        {/* 하단 액션 영역 */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-6 py-2.5 text-sm font-medium text-white shadow-sm backdrop-blur-sm hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </button>

          {userPlan === "free" ? (
            <>
              <button
                onClick={handleNewAnalysis}
                className="rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={testsRemaining <= 0}
              >
                {testsRemaining > 0 ? "다시 분석하기" : "체험 소진됨"}
              </button>
              <button
                onClick={() => router.push("/subscription")}
                className="rounded-md bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg hover:from-yellow-600 hover:to-orange-600"
              >
                365일 운세 구독하기
              </button>
            </>
          ) : (
            <button
              onClick={handleNewAnalysis}
              className="rounded-md bg-gray-700 px-6 py-2.5 text-sm font-medium text-gray-400 shadow-sm cursor-not-allowed"
              disabled
              title="하루 1회 분석 제한"
            >
              다시 분석하기
            </button>
          )}

          <button
            onClick={handleShare}
            className="ml-auto flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-6 py-2.5 text-sm font-medium text-white shadow-sm backdrop-blur-sm hover:bg-white/20"
          >
            <Share2 className="h-4 w-4" />
            공유하기
          </button>
        </div>
      </div>
    </div>
  );
}
