"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Key, CheckCircle, Github, Mail, Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { apiFetch, API_BASE_URL } from "@/lib/api";

type Provider = "select" | "github" | "google" | "local";
type LocalMode = "login" | "register";

// ── Google icon SVG ─────────────────────────────────────────────────
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

// ── GitHub 가이드 아코디언 ───────────────────────────────────────────
function GitHubGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border border-[#d0d7de] rounded-md overflow-hidden text-left">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#f6f8fa] hover:bg-[#eaecf0] transition-colors text-sm font-semibold text-[#24292f]"
      >
        <span className="flex items-center gap-2"><Key size={14}/> GitHub 코드 발급 방법 안내</span>
        {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
      </button>
      {open && (
        <div className="px-4 py-4 bg-white text-sm text-[#24292f] space-y-3 border-t border-[#d0d7de]">
          <p className="text-[#54595d] text-xs">GitHub 계정만 있으면 됩니다. 별도 API 키 발급이 필요하지 않습니다.</p>
          <ol className="space-y-2 list-none">
            {[
              { num: "1", text: "아래 '로그인하기' 버튼을 클릭합니다." },
              { num: "2", text: "나타나는 버튼을 눌러 GitHub 사이트가 열립니다." },
              { num: "3", text: "화면에 표시된 8자리 코드를 복사합니다." },
              { num: "4", text: "GitHub 사이트에 코드를 붙여넣고 'Continue' → 'Authorize'를 클릭합니다." },
              { num: "5", text: "이 화면에서 자동으로 로그인이 완료됩니다!" },
            ].map(item => (
              <li key={item.num} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0645ad] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {item.num}
                </span>
                <span className="text-[13px] text-[#24292f]">{item.text}</span>
              </li>
            ))}
          </ol>
          <div className="bg-[#ddf4ff] border border-[#54aeff] rounded p-2 text-[12px] text-[#0550ae]">
            💡 GitHub 계정이 없다면{" "}
            <a href="https://github.com/join" target="_blank" rel="noreferrer" className="underline font-semibold inline-flex items-center gap-0.5">
              무료로 만들기 <ExternalLink size={10}/>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GitHub Flow ──────────────────────────────────────────────────────
function GitHubFlow({ onSuccess }: { onSuccess: () => void }) {
  const setAuth = useAuthStore(state => state.setAuth);
  const [deviceCode, setDeviceCode] = useState("");
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("");
  const [status, setStatus] = useState<"loading"|"waiting"|"success"|"error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(300);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAuthContext = useCallback(() => {
    setStatus("loading"); setDeviceCode(""); setTimeLeft(300);
    apiFetch("/api/auth/device-code", { method: "POST" })
      .then(res => { if (!res.ok) throw new Error("Failed to fetch device code"); return res.json(); })
      .then(data => { setDeviceCode(data.device_code); setUserCode(data.user_code); setVerificationUri(data.verification_uri); setStatus("waiting"); })
      .catch(err => { setStatus("error"); setErrorMsg(err.message); });
  }, []);

  useEffect(() => { fetchAuthContext(); }, [fetchAuthContext]);

  useEffect(() => {
    let t: NodeJS.Timeout;
    if (status === "waiting" && timeLeft > 0) { t = setInterval(() => setTimeLeft(p => p - 1), 1000); }
    else if (timeLeft === 0 && status === "waiting") { setStatus("error"); setErrorMsg("인증 대기 시간(5분)이 만료되었습니다."); }
    return () => clearInterval(t);
  }, [status, timeLeft]);

  useEffect(() => {
    if (status !== "waiting" || !deviceCode) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      apiFetch("/api/auth/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_code: deviceCode }) })
        .then(r => r.json()).then(data => {
          if (data.status === "success") {
            setStatus("success"); setAuth(data.access_token, data.user);
            if (pollingRef.current) clearInterval(pollingRef.current);
            setTimeout(onSuccess, 1200);
          } else if (data.status !== "pending") {
            setStatus("error"); setErrorMsg(data.message || "Authorization failed.");
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }).catch(err => { setStatus("error"); setErrorMsg(err.message); if (pollingRef.current) clearInterval(pollingRef.current); });
    }, 6500);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [status, deviceCode, onSuccess, setAuth]);

  if (status === "loading") return <div className="py-8 flex flex-col items-center gap-3"><Loader2 size={32} className="animate-spin text-[#0645ad]"/><p className="text-sm text-[#54595d]">인증 코드 발급 중...</p></div>;
  if (status === "success") return <div className="py-8 flex flex-col items-center gap-3"><CheckCircle size={48} className="text-green-500"/><p className="font-bold text-[#000]">인증 완료!</p></div>;
  if (status === "error") return (
    <div className="py-6 flex flex-col items-center gap-3">
      <p className="text-red-600 font-bold text-sm">{errorMsg}</p>
      <button onClick={fetchAuthContext} className="px-4 py-2 border border-[#a2a9b1] text-sm hover:bg-[#eaecf0] rounded-sm">다시 시도</button>
    </div>
  );
  return (
    <div className="py-4 space-y-4">
      <a href={verificationUri} target="_blank" rel="noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-[#24292e] text-white py-2.5 rounded-md font-bold text-sm hover:bg-black transition-colors">
        <Github size={18}/> GitHub에서 인증하기
      </a>
      <div className="bg-[#f6f8fa] border border-[#d0d7de] rounded-md p-4 text-center">
        <p className="text-[11px] text-[#54595d] font-bold uppercase tracking-wider mb-2">입력할 코드</p>
        <span className="text-3xl font-mono tracking-widest font-bold text-[#000]">{userCode}</span>
      </div>
      <p className="text-[12px] text-[#54595d] text-center flex items-center justify-center gap-1">
        <Loader2 size={12} className="animate-spin"/>
        남은 시간: {Math.floor(timeLeft/60)}분 {String(timeLeft%60).padStart(2,"0")}초
      </p>
      <GitHubGuide/>
    </div>
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
      const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "오류가 발생했습니다."); return; }
      setAuth(data.access_token, data.user);
      setTimeout(onSuccess, 300);
    } catch { setError("네트워크 오류가 발생했습니다."); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="py-2 space-y-3">
      {mode === "register" && (
        <div>
          <label className="block text-xs font-bold mb-1 text-[#24292f]">닉네임</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="사용할 닉네임" className="w-full border border-[#d0d7de] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"/>
        </div>
      )}
      <div>
        <label className="block text-xs font-bold mb-1 text-[#24292f]">이메일</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="example@email.com" className="w-full border border-[#d0d7de] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"/>
      </div>
      <div>
        <label className="block text-xs font-bold mb-1 text-[#24292f]">비밀번호</label>
        <div className="relative">
          <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder={mode === "register" ? "6자 이상" : "비밀번호"} className="w-full border border-[#d0d7de] rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:border-[#0645ad]"/>
          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#54595d]">
            {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold py-2.5 rounded-md text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
        {loading && <Loader2 size={14} className="animate-spin"/>}
        {mode === "login" ? "로그인" : "회원가입"}
      </button>
      <p className="text-center text-[12px] text-[#54595d]">
        {mode === "login" ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}
        <button type="button" onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} className="ml-1 text-[#0645ad] underline font-semibold">
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
    { id: "github" as Provider, label: "GitHub으로 로그인", icon: <Github size={18}/>, cls: "bg-[#24292e] text-white hover:bg-black" },
    { id: "google" as Provider, label: "Google로 로그인", icon: <GoogleIcon/>, cls: "bg-white text-[#24292f] border border-[#d0d7de] hover:bg-[#f6f8fa]" },
    { id: "local" as Provider, label: "이메일로 로그인", icon: <Mail size={18}/>, cls: "bg-white text-[#24292f] border border-[#d0d7de] hover:bg-[#f6f8fa]" },
  ];

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full p-8 shadow-2xl border border-[#a2a9b1] rounded-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#0645ad] rounded-full flex items-center justify-center mx-auto mb-3">
            <Key size={22} className="text-white"/>
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#000]">AutoWiki 로그인</h2>
          <p className="text-sm text-[#54595d] mt-1">
            {provider === "select" && "로그인 방법을 선택하세요"}
            {provider === "github" && "GitHub 계정으로 로그인"}
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
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#d0d7de]"/></div>
              <div className="relative flex justify-center text-[11px] uppercase text-[#54595d] bg-white px-2 w-fit mx-auto">GitHub 가이드</div>
            </div>
            <GitHubGuide/>
          </div>
        )}

        {/* Provider flows */}
        {provider === "github" && <GitHubFlow onSuccess={onSuccess}/>}
        {provider === "local" && <LocalFlow onSuccess={onSuccess}/>}

        {/* Back button */}
        {provider !== "select" && (
          <button onClick={() => setProvider("select")} className="mt-4 w-full text-center text-xs text-[#54595d] hover:text-[#000] underline">
            ← 다른 방법으로 로그인
          </button>
        )}
      </div>
    </div>
  );
}
