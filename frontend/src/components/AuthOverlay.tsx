"use client";

import React, { useState } from "react";
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

// ── Local Auth Flow ──────────────────────────────────────────────────
function LocalFlow({ onSuccess, onBack }: { onSuccess: () => void, onBack: () => void }) {
  const setAuth = useAuthStore(state => state.setAuth);
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
      const res = await apiFetch(url, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(body) 
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "오류가 발생했습니다."); return; }
      setAuth(data.access_token, data.user);
      setTimeout(onSuccess, 300);
    } catch { setError("통신 오류가 발생했습니다."); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="py-2 space-y-3">
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
        <button type="button" onClick={onBack} className="text-[#54595d] hover:underline">← 뒤로가기</button>
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

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white max-w-sm w-full p-8 shadow-2xl border border-[#a2a9b1] rounded-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#0645ad] rounded-t-2xl"/>
        <div className="text-center mb-8 pt-2">
          <div className="w-12 h-12 bg-[#f0f4ff] rounded-full flex items-center justify-center mx-auto mb-4">
            <Key size={22} className="text-[#0645ad]"/>
          </div>
          <h2 className="text-2xl font-bold text-[#1a1a1a]">AutoWiki 로그인</h2>
          <p className="text-sm text-[#54595d] mt-2">간편하게 시작하고 지식을 정리하세요</p>
        </div>

        {provider === "select" ? (
          <div className="space-y-3">
            <button 
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-3 border border-[#d0d7de] rounded-md font-semibold text-sm hover:bg-[#f6f8fa] transition-colors"
            >
              <GoogleIcon/> Google로 시작하기
            </button>
            <button 
              onClick={() => setProvider("local")}
              className="w-full flex items-center justify-center gap-3 py-3 bg-[#24292f] text-white rounded-md font-semibold text-sm hover:bg-black transition-colors"
            >
              <Mail size={18}/> 이메일로 시작하기
            </button>
          </div>
        ) : (
          <LocalFlow onSuccess={onSuccess} onBack={() => setProvider("select")}/>
        )}

        <div className="mt-8 pt-4 border-t border-[#f0f0f0] text-center">
          <p className="text-[11px] text-[#a2a9b1]">로그인 시 서비스 이용 약관에 동의하게 됩니다.</p>
        </div>
      </div>
    </div>
  );
}
