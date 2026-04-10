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
  AlertTriangle
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
}

export function SetupTutorial({ onClose, onGoToSettings }: SetupTutorialProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 5; 

  const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  interface TutorialStep {
    title: string;
    desc: string;
    tip: string;
    icon: React.ReactNode;
    link?: string;
    linkText?: string;
    details?: { label: string; value: string; color: string }[];
  }

  const tutorialSteps: TutorialStep[] = [
    {
      title: "AutoWiki에 오신 것을 환영합니다!",
      desc: "본격적으로 AI 위키를 만들기 위해 사용자의 GitHub Copilot 권한을 연결하는 과정이 필요합니다.",
      tip: "새로운 연결 방식 덕분에 30초면 설정이 끝납니다!",
      icon: <Sparkles className="text-amber-400" size={36} />
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
      tip: "이제 복잡하게 토큰을 생성하고 복사할 필요가 없습니다.",
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

  const currentStep = tutorialSteps[step - 1];

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl z-[300] flex items-center justify-center p-4 transition-all">
      <div className="bg-white max-w-xl w-full rounded-[3rem] shadow-[0_0_100px_rgba(30,58,138,0.5)] overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-500">
        
        {/* Progress Dots */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {[...Array(totalSteps)].map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i + 1 === step ? "w-8 bg-blue-600" : "w-1.5 bg-slate-200"}`} />
          ))}
        </div>

        <button onClick={onClose} className="absolute top-7 right-7 p-3 text-slate-300 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all z-10">
          <X size={22} />
        </button>

        <div className="p-12 md:p-16 flex-1 flex flex-col items-center text-center">
          <div className="mb-10 p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem] shadow-inner transform -rotate-2">
            <div className="rotate-2">{currentStep.icon}</div>
          </div>

          <h3 className="text-3xl font-black text-slate-900 mb-5 leading-tight tracking-tight">{currentStep.title}</h3>
          <p className="text-slate-500 leading-relaxed text-base font-medium mb-10 whitespace-pre-line">{currentStep.desc}</p>

          {/* Details Section for Step 4 */}
          {currentStep.details && (
            <div className="w-full space-y-3 mb-10">
              {currentStep.details.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 px-6">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{item.label}</span>
                  <span className={`text-sm font-black ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="w-full bg-blue-50/50 border border-blue-100 rounded-[2rem] p-6 text-left flex items-start gap-4 shadow-sm">
            <div className="bg-white p-2 rounded-xl shadow-sm border border-blue-100">
               <CheckCircle className="text-blue-600 shrink-0" size={20} />
            </div>
            <p className="text-blue-900/80 text-[14px] font-bold leading-relaxed">{currentStep.tip}</p>
          </div>

          {currentStep.link && (
            <a href={currentStep.link} target="_blank" rel="noreferrer" className="mt-8 group flex items-center gap-3 text-sm font-black text-blue-600 bg-blue-50 px-6 py-3 rounded-full hover:bg-blue-600 hover:text-white transition-all">
               {currentStep.linkText} <ExternalLink size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"/>
            </a>
          )}
        </div>

        <div className="p-10 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between backdrop-blur-sm">
          <button onClick={prevStep} disabled={step === 1} className={`flex items-center gap-2 text-sm font-black ${step === 1 ? "text-slate-300 pointer-events-none" : "text-slate-400 hover:text-slate-900"}`}>
            <ChevronLeft size={22} /> Back
          </button>

          {step < totalSteps ? (
            <button onClick={nextStep} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-xl hover:shadow-blue-500/20 active:scale-95 flex items-center gap-2">
              알겠습니다, 다음! <ChevronRight size={22} />
            </button>
          ) : (
            <button onClick={onGoToSettings} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-xl hover:shadow-blue-500/20 active:scale-95 animate-bounce">
              설정 페이지로 이동하여 연결하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
