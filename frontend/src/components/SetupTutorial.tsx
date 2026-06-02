"use client";

import React, { useState } from "react";
import { 
  X, 
  ChevronRight, 
  ChevronLeft,
  Sparkles,
  FolderOpen,
  Plus,
  Bot,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  ExternalLink
} from "lucide-react";

interface SetupTutorialProps {
  onClose: () => void;
  onGoToSettings: () => void;
  userId?: number;
  initialProvider?: "github_copilot" | "ollama" | null;
}

interface TutorialStep {
  title: string;
  desc: string;
  tip: string;
  icon: React.ReactNode;
}

// ── Terms & Privacy Texts ──────────────────────────────────────────
const TERMS_TEXT = `제 1 조 (목적)
본 약관은 AutoWiki AI(이하 '서비스')가 제공하는 AI 기반 백과사전 문서 및 지식 그래프 자동 구축 서비스의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.

제 2 조 (이용자의 정의 및 동의)
1. '이용자'란 서비스가 제공하는 가입 절차를 거쳐 서비스를 이용하는 자를 말합니다.
2. 이용자가 가입 및 로그인 시 본 약관에 동의함은 서비스 이용과 관련된 모든 사항을 이해하고 수락한 것으로 간주합니다.

제 3 조 (데모 서비스 제공 및 제한)
1. 본 서비스는 시연용 데모 버전으로 운영됩니다.
2. 데모의 공정하고 안정적인 운영을 위해 모든 이용자 계정당 다음과 같은 이용 한도가 적용됩니다:
   - 프로젝트당 최대 저장 한도: 10MB (문서 파일 및 텍스트 데이터 포함)
   - AI 기능 활용 일일 토큰 한도: 100 토큰 (기획 1토큰, 채팅 2토큰, 문서 생성 5토큰 차감)
3. 서비스 제공자는 시스템 점검, 보안 이슈 등의 사유로 예고 없이 서비스를 일시 중단하거나 한도를 조정할 수 있습니다.

제 4 조 (책임 제한 및 면책)
1. 본 서비스에서 AI가 생성하는 백과사전 문서, 요약본, 관계도(지식 그래프) 정보는 인공지능 모델의 분석 결과물로, 사실 여부나 정확성을 보장하지 않으며 서비스 제공자는 이로 인한 어떠한 책임도 지지 않습니다.
2. 데모 서비스 특성상 데이터의 안전성 및 영구 보존을 보장하지 않으며, 서버 문제나 시연 기간 종료 등으로 인한 데이터 유실에 대해 면책됩니다. 중요한 정보는 이용자가 직접 '내보내기' 기능을 이용하여 로컬에 보관해야 합니다.`;

const PRIVACY_TEXT = `1. 개인정보 수집 및 이용 목적
AutoWiki AI는 시연용 AI 위키 서비스 제공을 위해 최소한의 개인정보를 수집 및 이용합니다:
- 계정 식별 및 가입 관리
- AI 기능 연동 및 잔여 토큰 카운트 매칭
- 데이터 저장소 용량 체크 및 할당량 관리

2. 수집하는 개인정보 항목
- 간편 가입(Google/OAuth) 시: 이메일 주소, 프로필 닉네임, 프로필 이미지 URL
- 일반 이메일 가입 시: 이메일 주소, 비밀번호(암호화 해시), 프로필 닉네임
- 서비스 이용 과정에서 생성되는 데이터: 업로드한 파일 텍스트, 생성된 위키 문서 본문 및 지식 관계 데이터

3. 개인정보의 보유 및 이용 기간
- 본 서비스는 시연용 버전으로, 수집된 개인정보 및 이용자 데이터는 계정 탈퇴 요청 시 또는 본 데모 시연 서비스가 완전히 공식 종료되는 시점에 즉시 영구 파기됩니다.
- 이용자는 언제든지 로그아웃 및 계정 연결을 중단할 수 있습니다.

4. 제3자 제공 및 위탁
본 서비스는 이용자의 명시적 동의 없이 개인정보를 외부에 제공하거나 위탁하지 않으며, 입력된 데이터는 지정된 보안 API 연동 이외의 용도로 활용되지 않습니다.`;

export function SetupTutorial({ onClose, onGoToSettings, userId }: SetupTutorialProps) {
  const [step, setStep] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState<"none" | "terms" | "privacy">("none");
  const totalSteps = 6;

  const nextStep = () => {
    if (step === 1 && !agreed) return;
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => {
    setStep(s => Math.max(s - 1, 1));
  };

  const steps: TutorialStep[] = [
    {
      title: "AutoWiki AI 서비스 이용 동의",
      desc: "지식 데이터 보호 및 공정한 시연을 위해 필수 이용 약관 및 개인정보 처리방침에 먼저 동의해 주세요. 동의하신 후 튜토리얼 학습과 AutoWiki AI 서비스를 비로소 시작하실 수 있습니다.",
      tip: "동의 여부는 가입 직후 최초 1회만 등록받으며, 이후 로그인 시에는 번거로운 체크 없이 즉시 대문으로 직행합니다.",
      icon: <ShieldCheck className="text-blue-500 animate-bounce" size={40} />
    },
    {
      title: "AutoWiki AI에 오신 것을 환영합니다!",
      desc: "AutoWiki AI는 사용자가 제공한 텍스트나 문서 파일을 바탕으로 AI가 자동으로 분석하여 위키피디아 스타일의 백과사전 문서와 이들의 연결 관계(지식 그래프)를 생성하는 지능형 지식 관리 도구입니다.",
      tip: "시연용 데모 버전으로, 간편하게 AI 자동 백과사전 작성을 체험할 수 있습니다.",
      icon: <Sparkles className="text-purple-500 animate-pulse" size={40} />
    },
    {
      title: "1. 프로젝트 생성 및 지식 추가",
      desc: "사이드바의 '＋' 버튼으로 새 프로젝트를 생성하고, 프로젝트 페이지의 '지식 추가'를 클릭하세요. 파일이나 텍스트를 입력하면 AI가 위키로 생성할 문서(노드)와 문서 간의 관계(엣지)를 자동으로 기획해 줍니다.",
      tip: "문서, PDF, 텍스트 파일 등을 분석해 새로운 지식 문서의 구조를 자동으로 뽑아냅니다.",
      icon: <Plus className="text-blue-500" size={40} />
    },
    {
      title: "2. AI 채팅 및 지식 구조도(관계도) 활용",
      desc: "'AI 채팅' 탭에서는 구축된 위키 문서들의 전체적인 맥락을 바탕으로 상세한 질문을 던지거나 지식을 확장하는 대화가 가능합니다. '구조도' 버튼을 누르면 문서들 간의 상호 참조 관계가 한눈에 들어오는 인터랙티브 네트워크 맵을 볼 수 있습니다.",
      tip: "관계도를 보고 단절된 노드를 다른 핵심 노드와 이어서 지식의 연결성을 한층 강화할 수 있습니다.",
      icon: <Bot className="text-orange-500" size={40} />
    },
    {
      title: "3. 데모 시스템 제한 (용량 & AI 토큰)",
      desc: "안정적인 시연을 위해 프로젝트당 최대 10MB의 저장 공간 한도가 주어집니다.\n또한, AI 사용 시마다 토큰이 차감됩니다:\n- 지식 기획 및 추출: 1토큰\n- AI 채팅 질문: 2토큰\n- 백과사전 문서 생성(커밋): 5토큰",
      tip: "💡 비밀 팁: 사이드바의 '대문' 메뉴를 연속으로 10번 클릭하면 언제든 토큰이 100개로 다시 완충됩니다!",
      icon: <AlertTriangle className="text-amber-500" size={40} />
    },
    {
      title: "이제 지식 지도를 그리러 가볼까요?",
      desc: "모든 핵심 개념과 튜토리얼을 숙지하셨습니다. 지금 바로 좌측 사이드바에서 새 프로젝트를 생성하고 자신만의 AI 지식 저장소를 구축해 보세요!",
      tip: "구축된 문서는 우측 상단의 '내보내기'로 저장하거나 가져올 수도 있습니다.",
      icon: <CheckCircle className="text-emerald-500" size={40} />
    }
  ];

  const currentStep = steps[step - 1];

  const handleFinish = () => {
    const key = userId ? `autowiki_tutorial_seen_${userId}` : "autowiki_tutorial_seen";
    localStorage.setItem(key, "true");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[300] flex items-center justify-center p-4 transition-all overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 max-w-xl w-full rounded-[2rem] shadow-2xl flex flex-col relative animate-in fade-in zoom-in-95 duration-300 my-auto max-h-[95dvh] overflow-hidden">
        
        {/* Progress Dots */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {[...Array(totalSteps)].map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i + 1 === step 
                  ? "w-8 bg-purple-600 dark:bg-purple-500"
                  : "w-1.5 bg-slate-200 dark:bg-zinc-700"
              }`} 
            />
          ))}
        </div>

        {/* Prevent closing tutorial on first step without consent */}
        {agreed && (
          <button onClick={onClose} className="absolute top-6 right-6 p-2.5 text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-all z-10">
            <X size={20} />
          </button>
        )}

        {/* Content Body */}
        <div className="p-6 pt-16 sm:p-10 md:p-12 flex-1 flex flex-col items-center text-center overflow-y-auto custom-scrollbar">
          <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-[2rem] shadow-inner transform -rotate-1">
            <div className="rotate-1">{currentStep.icon}</div>
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mb-4 leading-tight tracking-tight">
            {currentStep.title}
          </h3>
          <p className="text-slate-600 dark:text-gray-300 leading-relaxed text-sm font-medium mb-6 whitespace-pre-line max-w-md">
            {currentStep.desc}
          </p>

          {/* 1단계에서만 노출되는 동의 서브 뷰 */}
          {step === 1 && (
            <div className="w-full space-y-4 mb-6 text-left max-w-sm">
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowTermsModal("terms")}
                  className="flex-1 flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-150 dark:border-zinc-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-all"
                >
                  <span>이용 약관 전문 읽기</span>
                  <ExternalLink size={12} className="text-slate-400"/>
                </button>
                <button 
                  onClick={() => setShowTermsModal("privacy")}
                  className="flex-1 flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-150 dark:border-zinc-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-all"
                >
                  <span>개인정보 방침 전문 읽기</span>
                  <ExternalLink size={12} className="text-slate-400"/>
                </button>
              </div>

              <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-xl select-none">
                <input 
                  type="checkbox" 
                  id="agree-checkbox" 
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                />
                <label htmlFor="agree-checkbox" className="text-xs font-bold text-blue-900/90 dark:text-blue-300 leading-snug cursor-pointer">
                  [필수] 이용 약관 및 개인정보 처리방침의 내용을 확인하였으며, 서비스 약관에 전적으로 동의합니다.
                </label>
              </div>
            </div>
          )}

          {/* Highlighted Tip Area (1단계 아닐 때만 팁 노출) */}
          {step > 1 && (
            <div className="w-full border bg-slate-50/50 dark:bg-zinc-950/10 border-slate-100 dark:border-zinc-800/80 rounded-[1.5rem] p-4 text-left flex items-start gap-3.5 shadow-xs">
              <div className="p-1.5 bg-white dark:bg-zinc-850 rounded-lg shadow-xs border border-slate-100 dark:border-zinc-800 shrink-0">
                <CheckCircle className="text-purple-600 dark:text-purple-400" size={16} />
              </div>
              <p className="text-[12px] sm:text-[13px] font-semibold leading-relaxed text-purple-900/95 dark:text-purple-300">
                {currentStep.tip}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-zinc-900/50 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
          {step > 1 ? (
            <button 
              onClick={prevStep} 
              className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ChevronLeft size={18} /> 이전
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button 
              onClick={nextStep} 
              disabled={step === 1 && !agreed}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center gap-1.5 transition-all text-white ${
                step === 1 && !agreed
                  ? "bg-slate-300 dark:bg-zinc-800 text-slate-500 dark:text-gray-400 cursor-not-allowed shadow-none"
                  : "bg-purple-600 hover:bg-purple-700 shadow-purple-500/10 active:scale-95"
              }`}
            >
              {step === 1 ? "동의하고 튜토리얼 시작" : "다음 단계"} <ChevronRight size={18} />
            </button>
          ) : (
            <button 
              onClick={handleFinish} 
              className="px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20 active:scale-95 transition-all flex items-center gap-1.5"
            >
              대문으로 시작하기 <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Terms & Privacy Modal Overlay ────────────────────────────────── */}
      {showTermsModal !== "none" && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[400] flex items-center justify-center p-4" onClick={() => setShowTermsModal("none")}>
          <div className="bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 shadow-2xl p-6 max-w-lg w-full rounded-2xl my-auto max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 border-b pb-2 dark:border-zinc-800">
              <h3 className="text-base sm:text-lg font-bold text-[#1a1a1a] dark:text-white font-serif">
                {showTermsModal === "terms" ? "이용 약관" : "개인정보 처리방침"}
              </h3>
              <button onClick={() => setShowTermsModal("none")} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full text-slate-400 dark:text-gray-400">
                <X size={18}/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto text-[11px] sm:text-xs text-slate-600 dark:text-gray-300 whitespace-pre-line leading-relaxed pr-1 custom-scrollbar">
              {showTermsModal === "terms" ? TERMS_TEXT : PRIVACY_TEXT}
            </div>
            <div className="flex justify-end mt-4 pt-3 border-t dark:border-zinc-850">
              <button 
                onClick={() => setShowTermsModal("none")} 
                className="px-5 py-2 text-xs border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] hover:bg-[#eaecf0] dark:hover:bg-zinc-700 font-bold rounded-lg"
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
