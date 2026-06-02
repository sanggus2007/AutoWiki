"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Key, Mail, Eye, EyeOff, X } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { apiFetch, API_BASE_URL } from "@/lib/api";

type Provider = "select" | "google" | "local";
type LocalMode = "login" | "register";

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

// ── Icons ──────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

// ── Local Auth Flow (TEMPORARILY UNUSED BUT PRESERVED) ────────────────
function LocalFlow({ onSuccess, onBack }: { onSuccess: () => void, onBack: () => void }) {
  const setUser = useAuthStore(state => state.setUser);
  const [mode, setMode] = useState<LocalMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const url = mode === "login" ? "/api/auth/local/login" : "/api/auth/local/register";
    const body = mode === "login" ? { email, password } : { email, password, username };
    try {
      const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "오류가 발생했습니다."); return; }
      setUser(data.user);
      setTimeout(onSuccess, 300);
    } catch { setError("통신 오류가 발생했습니다."); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="py-2 space-y-3 animate-in slide-in-from-right-2 duration-300">
      {mode === "register" && (
        <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="닉네임" className="w-full border border-[#d0d7de] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400"/>
      )}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="이메일" className="w-full border border-[#d0d7de] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400"/>
      <div className="relative">
        <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="비밀번호" className="w-full border border-[#d0d7de] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400"/>
        <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#54595d] dark:text-gray-400">
          {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
        </button>
      </div>
      {error && <p className="text-red-650 dark:text-red-400 text-xs">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-[#0645ad] dark:bg-blue-600 hover:bg-[#0b0080] dark:hover:bg-blue-700 text-white font-bold py-2.5 rounded-md text-sm transition-colors flex items-center justify-center gap-2">
        {loading && <Loader2 size={14} className="animate-spin"/>}
        {mode === "login" ? "로그인" : "회원가입"}
      </button>
      <div className="flex justify-between items-center text-[12px]">
        <button type="button" onClick={onBack} className="text-[#54595d] dark:text-gray-400 hover:underline">← 다른 방법 선택</button>
        <button type="button" onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} className="text-[#0645ad] dark:text-blue-400 font-semibold underline">
          {mode === "login" ? "회원가입" : "로그인"}
        </button>
      </div>
    </form>
  );
}

// ── Main AuthOverlay ─────────────────────────────────────────────────
export function AuthOverlay({ onSuccess }: { onSuccess: () => void }) {
  const [provider, setProvider] = useState<Provider>("select");
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState<"none" | "terms" | "privacy">("none");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLocalhost(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    }
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 max-w-sm w-full p-10 shadow-2xl border border-[#a2a9b1] dark:border-zinc-800 rounded-3xl relative overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0645ad] to-[#3b82f6]"/>
        
        {/* Header */}
        <div className="text-center mb-8 pt-2">
          <div className="w-16 h-16 bg-[#f0f7ff] dark:bg-blue-950/30 rounded-2xl flex items-center justify-center mx-auto mb-5 rotate-3 shadow-sm border border-[#0645ad]/10 dark:border-blue-800/10">
            <Key size={30} className="text-[#0645ad] dark:text-blue-400 -rotate-3"/>
          </div>
          <h2 className="text-2xl font-black text-[#1a1a1a] dark:text-white tracking-tight">AutoWiki 로그인</h2>
          <p className="text-sm text-[#64748b] dark:text-gray-400 mt-2 font-medium">안전하게 시작하고 지식을 연결하세요</p>
        </div>

        {provider === "select" ? (
          <div className="space-y-4">

            <button 
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 border-2 border-[#f1f5f9] dark:border-zinc-800 rounded-xl font-bold text-[15px] bg-white dark:bg-zinc-800 text-[#1a1a1a] dark:text-white hover:bg-[#f8fafc] dark:hover:bg-zinc-700 hover:border-[#e2e8f0] dark:hover:border-zinc-700 transition-all active:scale-[0.98]"
            >
              <GoogleIcon/>
              <span className="hidden min-[380px]:inline">Google 계정으로 계속하기</span>
              <span className="inline min-[380px]:hidden">Google</span>
            </button>

            {/* 로컬호스트(개발 환경)에서만 이메일 로그인 노출 */}
            {isLocalhost && (
              <button 
                onClick={() => setProvider("local")}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-[#f8fafc] dark:bg-zinc-800 text-[#64748b] dark:text-gray-300 border border-dashed border-[#cbd5e1] dark:border-zinc-700 rounded-xl font-bold text-[15px] hover:bg-[#f1f5f9] dark:hover:bg-zinc-700 transition-all"
              >
                <Mail size={18}/>
                <span className="hidden min-[380px]:inline">[테스트용] 이메일로 계속하기</span>
                <span className="inline min-[380px]:hidden">이메일</span>
              </button>
            )}

          </div>
        ) : (
          <LocalFlow onSuccess={onSuccess} onBack={() => setProvider("select")}/>
        )}

        <div className="mt-8 pt-5 border-t border-[#f1f5f9] dark:border-zinc-800 text-center">
          <p className="text-[11px] text-[#94a3b8] dark:text-gray-500 leading-relaxed">
            로그인 시 AutoWiki의 <span className="underline cursor-pointer hover:text-[#0645ad] dark:hover:text-blue-400" onClick={() => setShowTermsModal("terms")}>이용 약관</span> 및 <br/>
            <span className="underline cursor-pointer hover:text-[#0645ad] dark:hover:text-blue-400" onClick={() => setShowTermsModal("privacy")}>개인정보 처리방침</span>에 동의하게 됩니다.
          </p>
        </div>
      </div>

      {/* ── Terms & Privacy Modal Overlay ────────────────────────────────── */}
      {showTermsModal !== "none" && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[200] flex items-center justify-center p-4" onClick={() => setShowTermsModal("none")}>
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
