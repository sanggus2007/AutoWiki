"use client";

import React, { useState, useEffect, useRef } from "react";
import { Key, Bot, Save, AlertCircle, CheckCircle2, HelpCircle, Sparkles, LogOut, Loader2, ExternalLink, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { SetupTutorial } from "@/components/SetupTutorial";

// ── Custom GitHub Icon ──────────────────────────────────────────────────
function GithubIcon({ size = 20, className = "" }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} height={size} viewBox="0 0 24 24" fill="none" 
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.28 1.15-.28 2.35 0 3.5-.73 1.02-1.08 2.25-1 3.5 0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}


export default function SettingsPage() {
  const setAuth = useAuthStore(state => state.setAuth);
  const [model, setModel] = useState("gemini-3.1-pro-preview");
  const [subModel, setSubModel] = useState("gemini-3-flash-preview");
  const [thinkingLevel, setThinkingLevel] = useState("HIGH");
  const [reasoningEffort, setReasoningEffort] = useState("high");
  const [githubToken, setGithubToken] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prompts, setPrompts] = useState<{key: string, name: string, content: string, description: string}[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsSaved, setPromptsSaved] = useState(false);

  // Device Flow States
  const [linking, setLinking] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<{user_code: string, verification_uri: string, device_code: string, interval: number} | null>(null);
  const [pollError, setPollError] = useState("");
  const [copied, setCopied] = useState(false);
  const pollCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (pollCleanup.current) pollCleanup.current();
    }
  }, []);

  useEffect(() => {
    // Load existing settings
    const savedModel = localStorage.getItem("autowiki_llm_model");
    const savedKey = localStorage.getItem("autowiki_llm_api_key");
    if (savedModel) setModel(savedModel);
    
    // 만약 예전 키가 있고 새 키(githubToken)가 없다면 예전 키를 로드하여 하위 호환성 유지
    const savedGithubToken = localStorage.getItem("autowiki_github_token");
    if (savedGithubToken) {
      setGithubToken(savedGithubToken);
    } else if (savedKey) {
      setGithubToken(savedKey);
    } else {
      // 둘 다 없으면 튜토리얼 자동 표시 (한 번도 안 본 경우만)
      const tutorialSeen = localStorage.getItem("autowiki_tutorial_seen");
      if (!tutorialSeen) {
        setShowTutorial(true);
      }
    }

    const savedSubModel = localStorage.getItem("autowiki_llm_sub_model");
    if (savedSubModel) setSubModel(savedSubModel);
    
    const savedThinking = localStorage.getItem("autowiki_llm_thinking_level");
    if (savedThinking) setThinkingLevel(savedThinking);
    const savedReasoning = localStorage.getItem("autowiki_llm_reasoning_effort");
    if (savedReasoning) setReasoningEffort(savedReasoning);

    // Load prompts
    const fetchPrompts = async () => {
      try {
        const res = await apiFetch("/api/prompts");
        if (res.ok) {
          const data = await res.json();
          setPrompts(data);
        }
      } catch (err) {
        console.error("Failed to load prompts", err);
      } finally {
        setPromptsLoading(false);
      }
    };
    fetchPrompts();
  }, []);

  const handlePromptChange = (key: string, newContent: string) => {
    setPrompts(prev => prev.map(p => p.key === key ? { ...p, content: newContent } : p));
  };

  const handlePromptsSave = async () => {
    try {
      for (const p of prompts) {
        await apiFetch(`/api/prompts/${p.key}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content: p.content })
        });
      }
      setPromptsSaved(true);
      setTimeout(() => setPromptsSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save prompts", err);
    }
  };

  const handleSave = () => {
    localStorage.setItem("autowiki_llm_model", model);
    localStorage.setItem("autowiki_llm_sub_model", subModel);
    localStorage.setItem("autowiki_llm_thinking_level", thinkingLevel);
    localStorage.setItem("autowiki_llm_reasoning_effort", reasoningEffort);
    localStorage.setItem("autowiki_github_token", githubToken);
    localStorage.setItem("autowiki_tutorial_seen", "true");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleStartLinking = async () => {
    setLinking(true);
    setPollError("");
    try {
      const res = await apiFetch("/api/auth/device-code", { method: "POST" });
      if (!res.ok) throw new Error("분찰 코드 신청 실패");
      const data = await res.json();
      setDeviceInfo(data);
      
      // Stop previous polling if any
      if (pollCleanup.current) pollCleanup.current();
      
      // Start Polling
      pollCleanup.current = startPolling(data.device_code, data.interval || 5);
    } catch (err: any) {
      setPollError(err.message);
      setLinking(false);
    }
  };

  const startPolling = (deviceCode: string, intervalSeconds: number) => {
    let stop = false;
    let timerId: any = null;

    const poll = async () => {
      if (stop) return;
      
      try {
        const res = await apiFetch("/api/auth/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode })
        });
        
        // Handle non-200 responses if necessary, but backend usually returns 200 with status: pending
        const data = await res.json();
        
        if (data.status === "success") {
          // 1. LLM용 토큰 저장
          localStorage.setItem("autowiki_github_token", data.github_token);
          setGithubToken(data.github_token);
          // 2. 서비스 세션 업데이트
          setAuth(data.access_token, data.user);
          
          setDeviceInfo(null);
          setLinking(false);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
          stop = true;
        } else if (data.status === "pending") {
          timerId = setTimeout(poll, intervalSeconds * 1000);
        } else if (data.status === "slow_down") {
          // Increase interval by 5 seconds as per GitHub spec
          intervalSeconds += 5;
          timerId = setTimeout(poll, intervalSeconds * 1000);
        } else {
          throw new Error(data.detail || "인증 실패");
        }
      } catch (err: any) {
        setPollError(err.message);
        setLinking(false);
        setDeviceInfo(null);
        stop = true;
      }
    };

    // Initial poll after the interval
    timerId = setTimeout(poll, intervalSeconds * 1000);

    // Provide a way to stop polling if component unmounts or user cancels
    return () => {
      stop = true;
      if (timerId) clearTimeout(timerId);
    };
  };

  const handleDisconnect = () => {
    if (confirm("GitHub Copilot 연결을 해제하시겠습니까? (저장된 모든 토큰이 삭제됩니다)")) {
      localStorage.removeItem("autowiki_github_token");
      localStorage.removeItem("autowiki_llm_api_key");
      setGithubToken("");
      // 브라우저 캐시 삭제 후 서버 캐시 삭제 요청 (선택 사항이나 권장)
      apiFetch("/api/auth/disconnect", { method: "POST" }).catch(() => {});
    }
  };

  const copyCode = () => {
    if (deviceInfo) {
      navigator.clipboard.writeText(deviceInfo.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto w-full font-sans text-[#202122] bg-white min-h-screen">
      <div className="border-b border-[#a2a9b1] mb-6 pb-2">
        <h1 className="text-3xl font-serif font-medium mb-1">환경 설정</h1>
        <p className="text-sm text-[#54595d]">AI 제공자 및 API 통합 키를 구성합니다.</p>
      </div>

      <div className="bg-[#f8f9fa] border border-[#a2a9b1] rounded-sm p-6 max-w-2xl">
        <h2 className="text-xl font-bold border-b border-[#a2a9b1] pb-2 mb-5 flex items-center">
          <Bot className="mr-2 text-[#54595d]" size={20} />
          LLM 모델 구성
        </h2>

        <div className="space-y-6">
          {/* GitHub Copilot Integration Section */}
          <div className="bg-[#f0f7ff] border border-[#0645ad]/20 rounded-md p-5 mb-2 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-[#0645ad] flex items-center uppercase tracking-wider">
                <GithubIcon size={18} className="mr-2" /> GitHub Copilot 통합
              </h3>
              <button 
                onClick={() => setShowTutorial(true)}
                className="text-[11px] font-bold text-[#0645ad] flex items-center gap-1 hover:underline bg-white px-2 py-1 rounded border border-[#0645ad]/10"
              >
                <HelpCircle size={12} /> 설정 안내
              </button>
            </div>
            
            <p className="text-[#54595d] text-[12px] mb-4 leading-relaxed">
              AutoWiki는 사용자의 Copilot 권한을 사용해 문서를 생성합니다. 별도의 토큰 발급 없이 GitHub 로그인을 통해 안전하게 연결할 수 있습니다.
            </p>

            <div className="space-y-4">
              {githubToken ? (
                <div className="flex items-center justify-between bg-white border border-[#00af89]/30 rounded-lg p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#00af89]/10 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="text-[#00af89]" size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#00af89]">연결됨</div>
                      <div className="text-[11px] text-[#54595d] font-mono">
                        {githubToken.substring(0, 8)}...{githubToken.substring(githubToken.length - 4)}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleDisconnect}
                    className="p-2 text-[#54595d] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="연결 해제"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              ) : linking ? (
                <div className="bg-white border border-[#0645ad]/20 rounded-xl p-6 text-center animate-in fade-in duration-300">
                  {deviceInfo ? (
                    <div className="space-y-5">
                      <div className="inline-flex flex-col">
                        <span className="text-[10px] font-black text-[#64748b] uppercase tracking-widest mb-1.5 px-3">인증 코드</span>
                        <div 
                          onClick={copyCode}
                          className="text-4xl font-black text-[#0645ad] tracking-[0.2em] bg-[#f8fafc] px-8 py-5 rounded-2xl border-2 border-dashed border-[#0645ad]/20 cursor-pointer hover:border-[#0645ad]/40 transition-all flex items-center gap-3 group"
                        >
                          {deviceInfo.user_code}
                          <div className="bg-white p-1.5 rounded-lg shadow-sm border border-[#e2e8f0] opacity-0 group-hover:opacity-100 transition-opacity">
                            {copied ? <Check size={14} className="text-[#00af89]"/> : <Copy size={14} className="text-[#64748b]"/>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <a 
                          href={deviceInfo.verification_uri} 
                          target="_blank" 
                          rel="noreferrer"
                          className="w-full bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#0645ad]/20"
                        >
                          GitHub에서 승인하기 <ExternalLink size={16} />
                        </a>
                        <div className="flex items-center justify-center gap-2 text-[12px] text-[#64748b] font-medium">
                          <Loader2 size={14} className="animate-spin" /> 사용자의 승인을 대기 중입니다...
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 flex flex-col items-center gap-3">
                      <Loader2 size={30} className="animate-spin text-[#0645ad]" />
                      <p className="text-sm font-bold text-[#64748b]">인증 정보를 가져오는 중...</p>
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={handleStartLinking}
                  className="w-full bg-white border-2 border-[#0645ad] text-[#0645ad] hover:bg-[#0645ad] hover:text-white font-black py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-sm group"
                >
                  <GithubIcon size={22} className="group-hover:rotate-12 transition-transform" />
                  GitHub Copilot 계정 연결하기
                </button>
              )}
              
              {pollError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-medium animate-shake">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {pollError}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] text-[#0645ad]/70 font-medium bg-white/50 p-2 rounded-md">
              <Sparkles size={14} /> GitHub 계정에 유료 Copilot 구독이 활성화되어 있어야 작동합니다.
            </div>
          </div>
          {/* Model Selection */}
          <div>
            <label className="block text-sm font-bold mb-1">
              AI 모델 지정
            </label>
            <p className="text-[#54595d] text-xs mb-2">원하는 AI 모델의 식별자를 정확히 입력해 주세요.</p>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="예: gpt-5.5-preview, claude-5-ultra"
              className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-sm shadow-inner"
            />
          </div>

          {/* Sub Model */}
          <div>
            <label className="block text-sm font-bold mb-1">
              보조 AI 모델 <span className="font-normal text-[#54595d] text-xs">(지식 구조 추출용)</span>
            </label>
            <p className="text-[#54595d] text-xs mb-2">1단계 지식 구조 추출에 사용할 모델입니다. 비교적 가벼운 작업이므로 저비용 모델 사용을 권장합니다.</p>
            <input
              id="sub-model-input"
              type="text"
              value={subModel}
              onChange={(e) => setSubModel(e.target.value)}
              placeholder="예: gpt-4o-mini, claude-3-haiku"
              className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-sm shadow-inner"
            />
          </div>

          {/* Advanced Reasoning Controls */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-[#eaecf0] border border-[#a2a9b1] rounded-sm">
            <div className="col-span-2 text-xs font-bold text-[#54595d] uppercase tracking-wider mb-1">고급 추론 제어 (Advanced Reasoning)</div>
            
            <div>
              <label className="block text-xs font-bold mb-1">
                Thinking Level <span className="font-normal text-[#54595d]">(Gemini 3+)</span>
              </label>
              <select
                value={thinkingLevel}
                onChange={(e) => setThinkingLevel(e.target.value)}
                className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[#0645ad] text-sm"
              >
                <option value="MINIMAL">MINIMAL</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">
                Reasoning Effort <span className="font-normal text-[#54595d]">(OpenAI o1/o3)</span>
              </label>
              <select
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
                className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[#0645ad] text-sm"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            
            <div className="col-span-2 text-[11px] text-[#54595d] leading-tight">
              * 모델이 해당 기능을 지원하지 않는 경우 무시됩니다. Gemini 3 시리즈는 Thinking Level을, OpenAI o 시리즈는 Reasoning Effort를 우선적으로 참조합니다.
            </div>
          </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[#0645ad]/70 font-medium">
              <Sparkles size={14} /> GitHub 계정에 유료 Copilot 구독이 활성화되어 있어야 작동합니다.
            </div>
            
            <div className="mt-4 bg-[#eaecf0] border border-[#a2a9b1] p-3 rounded-sm flex items-start text-[12px] text-[#202122]">
              <AlertCircle size={16} className="mr-2 shrink-0 mt-0.5 text-[#0645ad]" />
              <p>
                <b>개인정보 보호:</b> 입력하신 토큰은 브라우저에 안전하게 저장되며, 텍스트 분석 시에만 허가된 통로를 통해 사용됩니다. 저희 서버에는 토큰의 원본이 보관되지 않습니다.
              </p>
            </div>

          <div className="pt-4 border-t border-[#a2a9b1] flex items-center justify-between">
            {saved ? (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="flex items-center text-[#00af89] text-sm font-bold"
              >
                <CheckCircle2 size={16} className="mr-1.5" /> 설정이 저장되었습니다
              </motion.div>
            ) : (
              <div></div>
            )}
            
            <button
              onClick={handleSave}
              className="bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold px-4 py-2 rounded-sm flex items-center transition-colors"
            >
              <Save size={16} className="mr-2" /> 구성 저장하기
            </button>
          </div>
        </div>
      </div>

      {/* System Prompts Configuration */}
      <div className="bg-[#f8f9fa] border border-[#a2a9b1] rounded-sm p-6 max-w-2xl mt-6">
        <h2 className="text-xl font-bold border-b border-[#a2a9b1] pb-2 mb-5 flex items-center">
          <Bot className="mr-2 text-[#54595d]" size={20} />
          시스템 프롬프트 (System Prompts)
        </h2>
        
        {promptsLoading ? (
          <div className="text-sm text-[#54595d] py-4 text-center">프롬프트 데이터를 불러오는 중...</div>
        ) : (
          <div className="space-y-6">
            {prompts.map((prompt) => (
              <div key={prompt.key}>
                <label className="block text-sm font-bold mb-1">
                  {prompt.name}
                </label>
                <p className="text-[#54595d] text-xs mb-2">{prompt.description}</p>
                <textarea
                  value={prompt.content}
                  onChange={(e) => handlePromptChange(prompt.key, e.target.value)}
                  className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[13px] shadow-inner font-mono h-64 resize-y"
                  spellCheck="false"
                />
              </div>
            ))}

            <div className="pt-4 border-t border-[#a2a9b1] flex items-center justify-between">
              {promptsSaved ? (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  className="flex items-center text-[#00af89] text-sm font-bold"
                >
                  <CheckCircle2 size={16} className="mr-1.5" /> 저장되었습니다
                </motion.div>
              ) : (
                <div></div>
              )}
              
              <button
                onClick={handlePromptsSave}
                className="bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold px-4 py-2 rounded-sm flex items-center transition-colors"
              >
                <Save size={16} className="mr-2" /> 프롬프트 저장하기
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showTutorial && (
          <SetupTutorial 
            onClose={() => {
              localStorage.setItem("autowiki_tutorial_seen", "true");
              setShowTutorial(false);
            }} 
            onGoToSettings={() => {
              localStorage.setItem("autowiki_tutorial_seen", "true");
              setShowTutorial(false);
              document.getElementById("github-token-input")?.focus();
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
