"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Key, CheckCircle } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { apiFetch } from "@/lib/api";


export function AuthOverlay({ onSuccess }: { onSuccess: () => void }) {
  const setAuth = useAuthStore(state => state.setAuth);
  const [deviceCode, setDeviceCode] = useState<string>("");
  const [userCode, setUserCode] = useState<string>("");
  const [verificationUri, setVerificationUri] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "waiting" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(300);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAuthContext = useCallback(() => {
    setStatus("loading");
    setDeviceCode("");
    setTimeLeft(300);
    apiFetch("/api/auth/device-code", { method: "POST" })
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch device code");
        return res.json();
      })
      .then(data => {
        setDeviceCode(data.device_code);
        setUserCode(data.user_code);
        setVerificationUri(data.verification_uri);
        setStatus("waiting");
      })
      .catch(err => {
        setStatus("error");
        setErrorMsg(err.message);
      });
  }, []);

  useEffect(() => {
    fetchAuthContext();
  }, [fetchAuthContext]);

  useEffect(() => {
    // Timer Count-Down
    let countTimer: NodeJS.Timeout;
    if (status === "waiting" && timeLeft > 0) {
      countTimer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && status === "waiting") {
      setStatus("error");
      setErrorMsg("인증 대기 시간(5분)이 만료되었습니다.");
    }
    return () => clearInterval(countTimer);
  }, [status, timeLeft]);

  useEffect(() => {
    // 2. Poll for success
    if (status !== "waiting" || !deviceCode) return;

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(() => {
      apiFetch("/api/auth/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode })
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            setStatus("success");
            setAuth(data.access_token, data.user);
            if (pollingRef.current) clearInterval(pollingRef.current);
            setTimeout(onSuccess, 1500); // Wait a bit then close overlay
          } else if (data.status === "pending") {
            // Keep polling
          } else {
            setStatus("error");
            setErrorMsg(data.message || "Authorization failed.");
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        })
        .catch(err => {
          setStatus("error");
          setErrorMsg(err.message);
          if (pollingRef.current) clearInterval(pollingRef.current);
        });
    }, 6500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [status, deviceCode, onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full p-8 shadow-2xl border border-[#a2a9b1] text-center">
        <Key size={48} className="mx-auto mb-4 text-[#24292e]" />
        <h2 className="text-2xl font-serif font-bold text-[#000000] mb-2">AutoWiki 로그인</h2>
        
        {status === "loading" && (
          <div className="py-8">
            <Loader2 size={32} className="animate-spin text-[#0645ad] mx-auto mb-4" />
            <p className="text-[#54595d] text-sm">인증 코드를 발급받는 중...</p>
          </div>
        )}

        {status === "waiting" && (
          <div className="py-6 space-y-6">
            <div>
              <p className="text-sm text-[#202122] mb-3">
                자동 인증 세션이 만료되었습니다.<br/>
                아래 링크를 클릭하고 인증 코드를 입력하여 갱신하세요.
              </p>
              <a 
                href={verificationUri} 
                target="_blank" 
                rel="noreferrer"
                className="inline-block bg-[#24292e] text-white px-6 py-2.5 rounded-md font-bold text-sm tracking-wide hover:bg-[#000000] transition-colors shadow-md"
              >
                GitHub에서 인증하기
              </a>
            </div>

            <div className="bg-[#f8f9fa] border border-[#eaecf0] p-4 rounded-md">
              <span className="block text-[11px] font-bold text-[#54595d] uppercase tracking-wider mb-2">
                귀하의 인증 코드
              </span>
              <div className="flex items-center justify-center space-x-2">
                <Key size={18} className="text-[#0645ad]" />
                <span className="text-3xl font-mono tracking-widest text-[#000000] font-bold">
                  {userCode}
                </span>
              </div>
            </div>
            
            <p className="text-[12px] text-[#54595d] flex items-center justify-center">
              <Loader2 size={12} className="animate-spin mr-1.5" />
              남은 시간: {Math.floor(timeLeft / 60)}분 {(timeLeft % 60).toString().padStart(2, "0")}초 대기 중...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-8">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#000000] mb-2">인증 완료!</h3>
            <p className="text-sm text-[#54595d]">토큰이 성공적으로 갱신되었습니다. 백그라운드 작업을 재개합니다.</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-8">
            <h3 className="text-xl font-bold text-red-600 mb-2">인증 오류</h3>
            <p className="text-sm text-[#54595d]">{errorMsg}</p>
            <button 
              onClick={fetchAuthContext}
              className="mt-6 px-4 py-2 border border-[#a2a9b1] text-sm hover:bg-[#eaecf0]"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
