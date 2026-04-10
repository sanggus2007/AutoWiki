"use client";

import React, { useState } from "react";
import { Loader2, Key, Mail, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { apiFetch } from "@/lib/api";

type LocalMode = "login" | "register";

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
      if (!res.ok) { 
        setError(data.detail || "이메일 또는 비밀번호가 올바르지 않습니다."); 
        return; 
      }
      setAuth(data.access_token, data.user);
      setTimeout(onSuccess, 300);
    } catch { 
      setError("서버와 통신하는 중 오류가 발생했습니다."); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <form onSubmit={handleSubmit} className="py-2 space-y-4">
      {mode === "register" && (
        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#24292f] ml-1">닉네임</label>
          <input 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
            placeholder="사용하실 이름을 입력하세요" 
            className="w-full border border-[#d0d7de] rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0645ad]/20 focus:border-[#0645ad] transition-all"
          />
        </div>
      )}
      <div className="space-y-1">
        <label className="block text-xs font-bold text-[#24292f] ml-1">이메일</label>
        <input 
          type="email" 
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          required 
          placeholder="example@email.com" 
          className="w-full border border-[#d0d7de] rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0645ad]/20 focus:border-[#0645ad] transition-all"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-bold text-[#24292f] ml-1">비밀번호</label>
        <div className="relative">
          <input 
            type={showPw ? "text" : "password"} 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            placeholder={mode === "register" ? "6자 이상의 비밀번호" : "비밀번호를 입력하세요"} 
            className="w-full border border-[#d0d7de] rounded-md px-4 py-2.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#0645ad]/20 focus:border-[#0645ad] transition-all"
          />
          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#54595d] hover:text-[#0645ad] transition-colors">
            {showPw ? <EyeOff size={18}/> : <Eye size={18}/>}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-600 text-[13px] text-center font-medium">{error}</p>
        </div>
      )}

      <div className="pt-2">
        <button 
          type="submit" 
          disabled={loading} 
          className="w-full bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold py-3 rounded-md text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={16} className="animate-spin"/>}
          {mode === "login" ? "로그인" : "회원가입 완료"}
        </button>
      </div>

      <div className="text-center pt-2">
        <p className="text-[13px] text-[#54595d]">
          {mode === "login" ? "처음 오셨나요?" : "이미 계정이 있으신가요?"}
          <button 
            type="button" 
            onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} 
            className="ml-2 text-[#0645ad] underline font-bold hover:text-[#0b0080]"
          >
            {mode === "login" ? "회원가입 하기" : "로그인 하기"}
          </button>
        </p>
      </div>
    </form>
  );
}

// ── Main AuthOverlay ─────────────────────────────────────────────────
export function AuthOverlay({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div className="fixed inset-0 bg-[#000]/70 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white max-w-sm w-full p-10 shadow-2xl border border-[#d0d7de] rounded-2xl relative overflow-hidden">
        {/* Decorative Top Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0645ad] to-[#3672e1]" />
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#f0f4ff] border-2 border-[#0645ad]/20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
            <Key size={26} className="text-[#0645ad]"/>
          </div>
          <h2 className="text-2xl font-serif font-black text-[#1a1a1a] tracking-tight">AutoWiki</h2>
          <p className="text-sm text-[#54595d] mt-2 font-medium">이메일로 간편하게 시작하세요</p>
        </div>

        {/* Local Flow handles everything now */}
        <LocalFlow onSuccess={onSuccess}/>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-[#f0f0f0] text-center">
          <p className="text-[11px] text-[#a2a9b1] leading-relaxed">
            AutoWiki는 지식의 대중화와 공유를 지향합니다.<br/>
            로그인 시 서비스 이용 약관에 동의하게 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
