"use client";

import React, { useState } from "react";
import { 
  X, 
  ExternalLink, 
  Settings, 
  ShieldCheck, 
  Copy, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft,
  Sparkles,
  MousePointer2,
  ListChecks,
  AlertTriangle,
  Bot,
  Cpu,
  Check,
  HelpCircle,
  Info,
  Key
} from "lucide-react";

// ── Custom GitHub Icon ──────────────────────────────────────────────────
function GithubIcon({ size = 32, className = "" }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.28 1.15-.28 2.35 0 3.5-.73 1.02-1.08 2.25-1 3.5 0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface SetupTutorialProps {
  onClose: () => void;
  onGoToSettings: () => void;
  initialProvider?: "github_copilot" | "ollama" | null;
}

interface TutorialStep {
  title: string;
  desc: string;
  tip: string;
  icon: React.ReactNode;
  link?: string;
  linkText?: string;
  details?: { label: string; value: string; color: string }[];
}

export function SetupTutorial({ onClose, onGoToSettings, initialProvider = null }: SetupTutorialProps) {
  // If initialProvider is provided, we skip provider selection (step 0) and start straight at step 1.
  const [provider, setProvider] = useState<"github_copilot" | "ollama" | null>(initialProvider);
  const [step, setStep] = useState(initialProvider ? 1 : 0);

  const totalSteps = 5;

  const nextStep = () => {
    if (step === 0) {
      if (provider) {
        setStep(1);
        // Save the chosen preferred provider to localStorage for Settings integration
        localStorage.setItem("autowiki_preferred_provider", provider);
      }
      return;
    }
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => {
    if (step === 1 && !initialProvider) {
      setStep(0);
      return;
    }
    setStep(s => Math.max(s - 1, initialProvider ? 1 : 0));
  };

  // ── GitHub Copilot Tutorial Steps (5 steps) ─────────────────────────────────
  const copilotSteps: TutorialStep[] = [
    {
      title: "AutoWiki에 오신 것을 환영합니다!",
      desc: "본격적으로 AI 위키를 만들기 위해 사용자의 GitHub Copilot 권한을 연결하는 과정이 필요합니다.",
      tip: "빠르고 안전한 연결 환경을 제공합니다.",
      icon: <Sparkles className="text-amber-400 animate-pulse" size={36} />
    },
    {
      title: "사전 준비사항",
      desc: "로그인된 GitHub 계정이 있어야 하며, 해당 계정에 'Copilot 유료 구독'이 활성화되어 있어야 합니다.",
      tip: "구독이 안 되어 있으면 작동하지 않으니 꼭 확인해주세요!",
      link: "https://github.com/settings/copilot",
      linkText: "Copilot 구독 상태 확인하기",
      icon: <GithubIcon className="text-blue-600" size={36} />
    },
    {
      title: "간편한 계정 연결",
      desc: "설정 페이지에서 'GitHub Copilot 계정 연결하기' 버튼을 클릭하세요. 화면에 8자리의 인증 코드가 나타납니다.",
      tip: "토큰을 직접 생성하거나 복사할 필요 없이 클릭만으로 시작할 수 있습니다.",
      icon: <MousePointer2 className="text-orange-500" size={36} />
    },
    {
      title: "코드 입력 및 승인",
      desc: "나타난 코드를 복사(클릭)한 뒤, 'GitHub에서 승인하기' 버튼을 눌러 열린 페이지에 코드를 붙여넣으세요.",
      tip: "GitHub 페이지에서 'Authorize' 버튼까지 눌러야 완료됩니다.",
      icon: <ListChecks className="text-indigo-500" size={36} />
    },
    {
      title: "연결 완료!",
      desc: "승인이 완료되면 AutoWiki가 자동으로 이를 감지하고 연결을 확정합니다. 이제 바로 AI 기능을 사용할 수 있습니다.",
      tip: "한 번 연결하면 토큰 만료 전까지 계속 사용 가능합니다.",
      icon: <CheckCircle className="text-green-500" size={36} />
    }
  ];

  // ── Ollama Cloud Tutorial Steps (5 steps) ────────────────────────────────────────
  const ollamaSteps: TutorialStep[] = [
    {
      title: "Ollama Cloud와 함께하는 AutoWiki!",
      desc: "로컬 컴퓨터의 리소스를 소모하지 않고, Ollama의 고성능 클라우드 오픈소스 모델들을 안전하고 빠르게 활용할 수 있습니다.",
      tip: "클라우드 API 연동 방식으로 복잡한 로컬 실행 과정 없이 즉시 고성능 AI를 구축합니다.",
      icon: <Cpu className="text-purple-500 animate-pulse" size={36} />
    },
    {
      title: "Ollama 계정 로그인",
      desc: "ollama.com 공식 홈페이지에 접속하여 로그인(또는 회원 가입)을 진행해 주세요.",
      tip: "클라우드 서비스 및 API 키를 이용하기 위해 반드시 가입된 계정이 준비되어 있어야 합니다.",
      link: "https://ollama.com/pricing",
      linkText: "ollama.com 바로가기",
      icon: <Bot className="text-blue-500" size={36} />
    },
    {
      title: "구독 플랜 선택",
      desc: "Ollama Cloud는 Free, Pro (월 $20), Max (월 $100) 요금제를 제공합니다.\n필요량에 맞추어 구독 탭에서 원하는 플랜을 선택하여 활성화하세요.",
      tip: "월 $20의 Pro 플랜은 대규모 문서 요약과 지식 추출 작업을 더 빠른 속도와 넉넉한 처리 한도로 해결해 주므로 적극 추천합니다.",
      icon: <ShieldCheck className="text-amber-500" size={36} />
    },
    {
      title: "API Key 발급 및 복사",
      desc: "우측 상단 계정 아이콘을 클릭하고 'Keys' 메뉴로 이동하세요. 'Add API Key'를 누르고 원하는 이름을 적은 후 API 키를 생성합니다.",
      tip: "⚠️ 중요: API 키는 생성 시점에 반드시 한 번만 노출되며, 창을 닫으면 다시 확인할 수 없으므로 생성 즉시 안전한 곳에 복사해 두셔야 합니다!",
      icon: <Key className="text-indigo-500" size={36} />
    },
    {
      title: "AutoWiki에 연동 완료!",
      desc: "AutoWiki 설정 페이지의 'Ollama Pro / Local' 탭에서 Ollama Host URL(기본값: https://ollama.com)을 적고, 복사해 둔 API Key를 붙여넣은 뒤 저장하세요.",
      tip: "연동된 API Key는 AES-256 알고리즘을 이용해 강력히 암호화되어 안전하게 보관됩니다. 이제 자신만의 클라우드 AI 백과사전을 마음껏 활용해 보세요!",
      icon: <CheckCircle className="text-green-500" size={36} />
    }
  ];

  const currentSteps = provider === "ollama" ? ollamaSteps : copilotSteps;
  const currentStep = step > 0 ? currentSteps[step - 1] : null;

  const handleFinish = () => {
    if (provider) {
      localStorage.setItem("autowiki_preferred_provider", provider);
    }
    localStorage.setItem("autowiki_tutorial_seen", "true");
    onGoToSettings();
  };

  return (
    <div className="fixed inset-0 bg-slate-955/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4 transition-all overflow-y-auto">
      <div className="bg-white max-w-xl w-full rounded-[2rem] sm:rounded-[3rem] shadow-[0_0_100px_rgba(30,58,138,0.5)] flex flex-col relative animate-in fade-in zoom-in-95 duration-500 my-auto max-h-[90dvh] overflow-hidden">
        
        {/* Progress Dots */}
        {step > 0 && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {[...Array(totalSteps)].map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i + 1 === step 
                    ? provider === "ollama" ? "w-8 bg-purple-600" : "w-8 bg-blue-600"
                    : "w-1.5 bg-slate-200"
                }`} 
              />
            ))}
          </div>
        )}

        <button onClick={onClose} className="absolute top-[calc(1.75rem+env(safe-area-inset-top))] right-7 p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all z-10 sm:top-7">
          <X size={22} />
        </button>

        {/* ── Step 0: Provider Selection Screen ────────────────────────────────── */}
        {step === 0 && (
          <div className="p-6 pt-16 sm:p-12 md:p-16 flex-1 flex flex-col items-center overflow-y-auto custom-scrollbar">
            <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-[2rem] shadow-inner transform -rotate-1">
              <Sparkles className="text-blue-600" size={36} />
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 text-center leading-tight tracking-tight">
              AI 서비스 제공자 선택
            </h3>
            <p className="text-slate-500 text-center leading-relaxed text-xs sm:text-sm font-medium mb-8 max-w-sm">
              AutoWiki에서 개인 백과사전 문서를 분석하고 생성할 AI 엔진을 선택해 주세요. 설정에서 언제든 변경이 가능합니다.
            </p>

            <div className="w-full space-y-4 mb-8">
              {/* GitHub Copilot Card */}
              <div 
                onClick={() => setProvider("github_copilot")}
                className={`group cursor-pointer rounded-2xl border-2 p-5 transition-all flex items-start gap-4 ${
                  provider === "github_copilot" 
                    ? "border-blue-600 bg-blue-50/50 shadow-md shadow-blue-500/10" 
                    : "border-slate-100 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                  provider === "github_copilot" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                }`}>
                  <GithubIcon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-sm sm:text-base text-slate-900">GitHub Copilot</span>
                    <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">추천</span>
                  </div>
                  <p className="text-slate-500 text-xs leading-relaxed font-medium">
                    GitHub 계정 연동을 통해 별도의 복잡한 설치 없이 고성능 Gemini 및 OpenAI 모델을 가장 편리하게 사용합니다.
                  </p>
                </div>
              </div>

              {/* Ollama Card */}
              <div 
                onClick={() => setProvider("ollama")}
                className={`group cursor-pointer rounded-2xl border-2 p-5 transition-all flex items-start gap-4 ${
                  provider === "ollama" 
                    ? "border-purple-600 bg-purple-50/50 shadow-md shadow-purple-500/10" 
                    : "border-slate-100 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                  provider === "ollama" ? "bg-purple-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                }`}>
                  <Bot size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-sm sm:text-base text-slate-900">Ollama Pro / Cloud</span>
                    <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">클라우드 API</span>
                  </div>
                  <p className="text-slate-500 text-xs leading-relaxed font-medium">
                    Ollama Cloud API를 연동하여 Free/Pro/Max 요금제의 강력한 오픈소스 모델을 클라우드 성능으로 끊김 없이 사용합니다.
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={nextStep}
              disabled={!provider}
              className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${
                provider 
                  ? provider === "ollama" 
                    ? "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                  : "bg-slate-150 text-slate-400 cursor-not-allowed shadow-none border border-slate-200"
              }`}
            >
              선택한 서비스로 튜토리얼 시작하기 <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── Step 1-5: Selected Provider Tutorial Screen ─────────────────────── */}
        {step > 0 && currentStep && (
          <div className="p-6 pt-16 sm:p-12 md:p-16 flex-1 flex flex-col items-center text-center overflow-y-auto custom-scrollbar">
            <div className={`mb-4 sm:mb-8 p-4 sm:p-5 border rounded-[2.5rem] shadow-inner transform -rotate-2 ${
              provider === "ollama" 
                ? "bg-purple-50 border-purple-100" 
                : "bg-blue-50 border-blue-100"
            }`}>
              <div className="rotate-2">{currentStep.icon}</div>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-3 sm:mb-4 leading-tight tracking-tight">
              {currentStep.title}
            </h3>
            <p className="text-slate-500 leading-relaxed text-xs sm:text-sm font-medium mb-6 sm:mb-8 whitespace-pre-line max-w-md">
              {currentStep.desc}
            </p>

            {/* Highlighted Tip Area */}
            <div className={`w-full border rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-5 text-left flex items-start gap-4 shadow-sm ${
              provider === "ollama"
                ? "bg-purple-50/50 border-purple-100"
                : "bg-blue-50/50 border-blue-100"
            }`}>
              <div className={`p-2 rounded-xl shadow-sm border ${
                provider === "ollama" ? "bg-white border-purple-100" : "bg-white border-blue-100"
              }`}>
                <CheckCircle className={provider === "ollama" ? "text-purple-600 shrink-0" : "text-blue-600 shrink-0"} size={20} />
              </div>
              <p className={`text-[13px] font-bold leading-relaxed ${
                provider === "ollama" ? "text-purple-900/80" : "text-blue-900/80"
              }`}>
                {currentStep.tip}
              </p>
            </div>

            {currentStep.link && (
              <a 
                href={currentStep.link} 
                target="_blank" 
                rel="noreferrer" 
                className={`mt-6 group flex items-center gap-2 text-xs sm:text-sm font-black px-6 py-3 rounded-full transition-all border ${
                  provider === "ollama"
                    ? "text-purple-600 bg-purple-50 hover:bg-purple-600 hover:text-white border-purple-100 hover:border-transparent"
                    : "text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white border-blue-100 hover:border-transparent"
                }`}
              >
                {currentStep.linkText} 
                <ExternalLink size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        {step > 0 && (
          <div className="p-4 sm:p-10 bg-white border-t border-slate-100 flex items-center justify-between backdrop-blur-sm pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-10">
            <button 
              onClick={prevStep} 
              className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-slate-400 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft size={20} /> 이전으로
            </button>

            {step < totalSteps ? (
              <button 
                onClick={nextStep} 
                className={`px-10 py-3.5 rounded-2xl font-black text-xs sm:text-sm hover:shadow-xl active:scale-95 flex items-center gap-1.5 transition-all text-white ${
                  provider === "ollama"
                    ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/15"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/15"
                }`}
              >
                알겠습니다, 다음! <ChevronRight size={20} />
              </button>
            ) : (
              <button 
                onClick={handleFinish} 
                className={`px-10 py-3.5 rounded-2xl font-black text-xs sm:text-sm active:scale-95 transition-all animate-bounce text-white shadow-xl ${
                  provider === "ollama"
                    ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                }`}
              >
                설정 페이지로 이동하여 구성하기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
