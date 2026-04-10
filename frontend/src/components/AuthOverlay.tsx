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
function LocalFlow({ onSuccess }: { onSuccess: () => void }) {
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
    } catch { 
      setError("네트워크 오류가 발생했습니다."); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <form onSubmit={handleSubmit} className="py-2 space-y-3">
      {mode === "register" && (
        <div>
          <label className="block text-xs font-bold mb-1 text-[#24292f]">닉네임</label>
          <input 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
            placeholder="사용할 닉네임" 
            className="w-full border border-[#d0d7de] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-bold mb-1 text-[#24292f]">이메일</label>
        <input 
          type="email" 
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          required 
          placeholder="example@email.com" 
          className="w-full border border-[#d0d7de] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"
        />
      </div>
      <div>
        <label className="block text-xs font-bold mb-1 text-[#24292f]">비밀번호</label>
        <div className="relative">
          <input 
            type={showPw ? "text" : "password"} 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            placeholder={mode === "register" ? "6자 이상" : "비밀번호"} 
            className="w-full border border-[#d0d7de] rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:border-[#0645ad]"
          />
          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#54595d]">
            {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <button 
        type="submit" 
        disabled={loading} 
        className="w-full bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold py-2.5 rounded-md text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={14} className="animate-spin"/>}
        {mode === "login" ? "로그인" : "회원가입"}
      </button>
      <p className="text-center text-[12px] text-[#54595d]">
        {mode === "login" ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}
        <button 
          type="button" 
          onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} 
          className="ml-1 text-[#0645ad] underline font-semibold"
        >
          {mode === "login" ? "회원가입" : "로그인"}
        </button>
      </p>
    </form>
  );
}

// ── Main AuthOverlay ─────────────────────────────────────────────────
export function AuthOverlay({ onSuccess }: { onSuccess: () => void }) {
  const [provider, setProvider] = useState<Provider>("select");

  const providerBtns = [
    { id: "google" as Provider, label: "Google로 로그인", icon: <GoogleIcon/>, cls: "bg-white text-[#24292f] border border-[#d0d7de] hover:bg-[#f6f8fa]" },
    { id: "local" as Provider, label: "이메일로 로그인", icon: <Mail size={18}/>, cls: "bg-white text-[#24292f] border border-[#d0d7de] hover:bg-[#f6f8fa]" },
  ];

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white max-w-sm w-full p-8 shadow-2xl border border-[#a2a9b1] rounded-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#0645ad] rounded-full flex items-center justify-center mx-auto mb-4">
            <Key size={22} className="text-white"/>
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#000]">AutoWiki 로그인</h2>
          <p className="text-sm text-[#54595d] mt-2">
            {provider === "select" && "로그인 방법을 선택하세요"}
            {provider === "google" && "Google 계정으로 로그인"}
            {provider === "local" && "이메일 계정으로 로그인"}
          </p>
        </div>

        {/* Select screen */}
        {provider === "select" && (
          <div className="space-y-3">
            {providerBtns.map(btn => (
              <button
                key={btn.id}
                onClick={() => btn.id === "google" ? handleGoogleLogin() : setProvider(btn.id)}
                className={`w-full flex items-center justify-center gap-3 py-3 rounded-md font-semibold text-sm transition-colors ${btn.cls}`}
              >
                {btn.icon} {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Provider flows */}
        {provider === "local" && <LocalFlow onSuccess={onSuccess}/>}

        {/* Back button */}
        {provider !== "select" && (
          <button 
            onClick={() => setProvider("select")} 
            className="mt-6 w-full text-center text-xs text-[#54595d] hover:text-[#000] underline"
          >
            ← 다른 방법으로 로그인
          </button>
        )}
      </div>
    </div>
  );
}
