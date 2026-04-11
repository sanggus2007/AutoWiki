"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Key, Mail, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { apiFetch, API_BASE_URL } from "@/lib/api";

type Provider = "select" | "google" | "local";
type LocalMode = "login" | "register";

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
        <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="닉네임" className="w-full border border-[#d0d7de] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"/>
      )}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="이메일" className="w-full border border-[#d0d7de] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"/>
      <div className="relative">
        <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="비밀번호" className="w-full border border-[#d0d7de] rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:border-[#0645ad]"/>
        <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#54595d]">
          {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
        </button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold py-2.5 rounded-md text-sm transition-colors flex items-center justify-center gap-2">
        {loading && <Loader2 size={14} className="animate-spin"/>}
        {mode === "login" ? "로그인" : "회원가입"}
      </button>
      <div className="flex justify-between items-center text-[12px]">
        <button type="button" onClick={onBack} className="text-[#54595d] hover:underline">← 다른 방법 선택</button>
        <button type="button" onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} className="text-[#0645ad] font-semibold underline">
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
      <div className="bg-white max-w-sm w-full p-10 shadow-2xl border border-[#a2a9b1] rounded-3xl relative overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0645ad] to-[#3b82f6]"/>
        
        {/* Header */}
        <div className="text-center mb-10 pt-2">
          <div className="w-16 h-16 bg-[#f0f7ff] rounded-2xl flex items-center justify-center mx-auto mb-5 rotate-3 shadow-sm border border-[#0645ad]/10">
            <Key size={30} className="text-[#0645ad] -rotate-3"/>
          </div>
          <h2 className="text-2xl font-black text-[#1a1a1a] tracking-tight">AutoWiki 로그인</h2>
          <p className="text-sm text-[#64748b] mt-2 font-medium">안전하게 시작하고 지식을 연결하세요</p>
        </div>

        {provider === "select" ? (
          <div className="space-y-4">
            <button 
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 border-2 border-[#f1f5f9] rounded-xl font-bold text-[15px] hover:bg-[#f8fafc] hover:border-[#e2e8f0] transition-all active:scale-[0.98]"
            >
              <GoogleIcon/> Google 계정으로 계속하기
            </button>

            {/* 로컬호스트(개발 환경)에서만 이메일 로그인 노출 */}
            {isLocalhost && (
              <button 
                onClick={() => setProvider("local")}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-[#f8fafc] text-[#64748b] border border-dashed border-[#cbd5e1] rounded-xl font-bold text-[15px] hover:bg-[#f1f5f9] transition-all"
              >
                <Mail size={18}/> [테스트용] 이메일로 계속하기
              </button>
            )}

          </div>
        ) : (
          <LocalFlow onSuccess={onSuccess} onBack={() => setProvider("select")}/>
        )}

        <div className="mt-10 pt-6 border-t border-[#f1f5f9] text-center">
          <p className="text-[11px] text-[#94a3b8] leading-relaxed">
            로그인 시 AutoWiki의 <span className="underline cursor-pointer">이용 약관</span> 및 <br/>
            <span className="underline cursor-pointer">개인정보 처리방침</span>에 동의하게 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
