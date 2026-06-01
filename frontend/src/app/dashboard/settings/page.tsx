"use client";

import React, { useState, useEffect, useRef } from "react";
import { Key, Bot, Save, AlertCircle, CheckCircle2, HelpCircle, Sparkles, LogOut, Loader2, ExternalLink, Copy, Check, RotateCcw } from "lucide-react";
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
  const setUser = useAuthStore(state => state.setUser);
  const [model, setModel] = useState("gemini-3.1-pro-preview");
  const [subModel, setSubModel] = useState("gemini-3-flash-preview");
  const [thinkingLevel, setThinkingLevel] = useState("HIGH");
  const [reasoningEffort, setReasoningEffort] = useState("high");
  const [isGithubLinked, setIsGithubLinked] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialProvider, setTutorialProvider] = useState<"github_copilot" | "ollama" | null>(null);
  const [saved, setSaved] = useState(false);
  const [aiProvider, setAiProvider] = useState<"github_copilot" | "ollama">("github_copilot");
  const [ollamaHost, setOllamaHost] = useState("https://ollama.com");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [hasOllamaKey, setHasOllamaKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Provider-specific model states
  const [copilotModel, setCopilotModel] = useState("gemini-3.1-pro-preview");
  const [copilotSubModel, setCopilotSubModel] = useState("gemini-3-flash-preview");
  const [ollamaModel, setOllamaModel] = useState("llama3");
  const [ollamaSubModel, setOllamaSubModel] = useState("llama3");
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
    // Load existing settings with provider-specific support & fallback
    const savedModel = localStorage.getItem("autowiki_llm_model");
    const savedSubModel = localStorage.getItem("autowiki_llm_sub_model");

    const savedCopilotModel = localStorage.getItem("autowiki_llm_model_copilot") || 
      (savedModel && (savedModel.includes("gemini") || savedModel.includes("gpt") || savedModel.includes("o1")) ? savedModel : null) || 
      "gemini-3.1-pro-preview";
    const savedCopilotSubModel = localStorage.getItem("autowiki_llm_sub_model_copilot") || 
      (savedSubModel && (savedSubModel.includes("gemini") || savedSubModel.includes("gpt") || savedSubModel.includes("o1")) ? savedSubModel : null) || 
      "gemini-3-flash-preview";

    const savedOllamaModel = localStorage.getItem("autowiki_llm_model_ollama") || 
      (savedModel && !(savedModel.includes("gemini") || savedModel.includes("gpt") || savedModel.includes("o1")) ? savedModel : null) || 
      "llama3";
    const savedOllamaSubModel = localStorage.getItem("autowiki_llm_sub_model_ollama") || 
      (savedSubModel && !(savedSubModel.includes("gemini") || savedSubModel.includes("gpt") || savedSubModel.includes("o1")) ? savedSubModel : null) || 
      "llama3";

    setCopilotModel(savedCopilotModel);
    setCopilotSubModel(savedCopilotSubModel);
    setOllamaModel(savedOllamaModel);
    setOllamaSubModel(savedOllamaSubModel);
    
    // Check GitHub Linking status and AI Settings from backend
    apiFetch("/api/users/me")
      .then(res => res.json())
      .then(data => {
        setIsGithubLinked(data.is_github_linked);
        
        // Sync preferred provider from localStorage if backend doesn't have it set yet
        const savedPreferred = localStorage.getItem("autowiki_preferred_provider") as "github_copilot" | "ollama";
        const provider = data.ai_provider || savedPreferred || "github_copilot";
        setAiProvider(provider);
        setOllamaHost(data.ollama_host || "https://ollama.com");
        setHasOllamaKey(data.has_ollama_key || false);
        if (data.has_ollama_key) {
          setOllamaApiKey("");
        }
        
        // Sync active inputs based on loaded provider
        if (provider === "github_copilot") {
          setModel(savedCopilotModel || data.model || "gemini-3.1-pro-preview");
          setSubModel(savedCopilotSubModel || data.sub_model || "gemini-3-flash-preview");
        } else {
          setModel(savedOllamaModel || data.model || "llama3");
          setSubModel(savedOllamaSubModel || data.sub_model || "llama3");
        }
        
        if (!data.is_github_linked && provider === "github_copilot") {
          const tutorialSeen = localStorage.getItem("autowiki_tutorial_seen");
          if (!tutorialSeen) {
            setShowTutorial(true);
            setTutorialProvider("github_copilot");
          }
        }
      })
      .catch(err => console.error("Failed to check auth status", err));
    
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

  const handleResetPrompts = async () => {
    if (confirm("모든 시스템 프롬프트를 권장 기본값으로 복구하시겠습니까? 현재 작성된 내용은 사라집니다.")) {
      try {
        const res = await apiFetch("/api/prompts/reset", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setPrompts(data);
          setPromptsSaved(true);
          setTimeout(() => setPromptsSaved(false), 3000);
        }
      } catch (err) {
        console.error("Failed to reset prompts", err);
      }
    }
  };

  const handleProviderSwitch = (provider: "github_copilot" | "ollama") => {
    if (provider === aiProvider) return;
    
    // Save current active input values to current provider's state
    if (aiProvider === "github_copilot") {
      setCopilotModel(model);
      setCopilotSubModel(subModel);
      // Load Ollama state into active inputs
      setModel(ollamaModel);
      setSubModel(ollamaSubModel);
    } else {
      setOllamaModel(model);
      setOllamaSubModel(subModel);
      // Load Copilot state into active inputs
      setModel(copilotModel);
      setSubModel(copilotSubModel);
    }
    setAiProvider(provider);
  };

  const handleSave = async () => {
    localStorage.setItem("autowiki_llm_model", model);
    localStorage.setItem("autowiki_llm_sub_model", subModel);
    localStorage.setItem("autowiki_llm_model_copilot", copilotModel);
    localStorage.setItem("autowiki_llm_sub_model_copilot", copilotSubModel);
    localStorage.setItem("autowiki_llm_model_ollama", ollamaModel);
    localStorage.setItem("autowiki_llm_sub_model_ollama", ollamaSubModel);
    localStorage.setItem("autowiki_llm_thinking_level", thinkingLevel);
    localStorage.setItem("autowiki_llm_reasoning_effort", reasoningEffort);
    localStorage.setItem("autowiki_tutorial_seen", "true");

    // Secure API key resolution
    let keyPayload = ollamaApiKey;
    if (ollamaApiKey === "" && hasOllamaKey) {
      keyPayload = "********";
    }

    try {
      const res = await apiFetch("/api/users/me/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_provider: aiProvider,
          ollama_host: ollamaHost,
          ollama_api_key: keyPayload
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiProvider(data.ai_provider);
        setOllamaHost(data.ollama_host);
        setHasOllamaKey(data.has_ollama_key);
        setOllamaApiKey("");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const errData = await res.json();
        alert(`설정 저장 실패: ${errData.detail || "알 수 없는 오류"}`);
      }
    } catch (err: any) {
      alert(`서버 연결 오류: ${err.message}`);
    }
  };

  const handleResetConfig = () => {
    if (confirm("모든 모델 구성을 기본값으로 초기화하시겠습니까?")) {
      const defaultCopilotModel = "gemini-3.1-pro-preview";
      const defaultCopilotSubModel = "gemini-3-flash-preview";
      const defaultOllamaModel = "llama3";
      const defaultOllamaSubModel = "llama3";
      const defaultThinking = "HIGH";
      const defaultReasoning = "high";

      setCopilotModel(defaultCopilotModel);
      setCopilotSubModel(defaultCopilotSubModel);
      setOllamaModel(defaultOllamaModel);
      setOllamaSubModel(defaultOllamaSubModel);

      const activeModel = aiProvider === "github_copilot" ? defaultCopilotModel : defaultOllamaModel;
      const activeSubModel = aiProvider === "github_copilot" ? defaultCopilotSubModel : defaultOllamaSubModel;

      setModel(activeModel);
      setSubModel(activeSubModel);
      setThinkingLevel(defaultThinking);
      setReasoningEffort(defaultReasoning);

      localStorage.setItem("autowiki_llm_model", activeModel);
      localStorage.setItem("autowiki_llm_sub_model", activeSubModel);
      localStorage.setItem("autowiki_llm_model_copilot", defaultCopilotModel);
      localStorage.setItem("autowiki_llm_sub_model_copilot", defaultCopilotSubModel);
      localStorage.setItem("autowiki_llm_model_ollama", defaultOllamaModel);
      localStorage.setItem("autowiki_llm_sub_model_ollama", defaultOllamaSubModel);
      localStorage.setItem("autowiki_llm_thinking_level", defaultThinking);
      localStorage.setItem("autowiki_llm_reasoning_effort", defaultReasoning);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
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
          // 1. 상태 업데이트 (원본 토큰은 브라우저에 저장하지 않음)
          setIsGithubLinked(true);
          // 2. 서비스 세션 업데이트
          setUser(data.user);
          
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

  const handleDisconnect = async () => {
    if (confirm("GitHub Copilot 연결을 해제하시겠습니까?")) {
      try {
        const res = await apiFetch("/api/auth/github/disconnect", { method: "POST" });
        if (res.ok) {
          setIsGithubLinked(false);
          // 전역 유저 상태에서도 연결 정보 제거된 버전으로 업데이트
          const meRes = await apiFetch("/api/users/me");
          if (meRes.ok) {
            const freshUser = await meRes.json();
            setUser(freshUser);
          }
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch (err) {
        console.error("Disconnect failed", err);
      }
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
          {/* AI Provider Switcher */}
          <div className="mb-6">
            <label className="block text-sm font-bold mb-2">AI 서비스 제공자 선택</label>
            <div className="grid grid-cols-2 gap-4">
              {/* GitHub Copilot Card */}
              <div 
                onClick={() => handleProviderSwitch("github_copilot")}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-all flex flex-col items-center justify-center gap-2 ${
                  aiProvider === "github_copilot" 
                    ? "border-[#0645ad] bg-[#f0f7ff] shadow-md" 
                    : "border-[#e2e8f0] bg-white hover:border-[#a2a9b1]"
                }`}
              >
                <GithubIcon size={28} className={aiProvider === "github_copilot" ? "text-[#0645ad]" : "text-[#54595d]"} />
                <div className="text-sm font-bold text-center">GitHub Copilot</div>
                <div className="text-[10px] text-[#54595d] text-center">유료 구독 연동 (추천)</div>
              </div>

              {/* Ollama Cloud / Local Card */}
              <div 
                onClick={() => handleProviderSwitch("ollama")}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-all flex flex-col items-center justify-center gap-2 ${
                  aiProvider === "ollama" 
                    ? "border-[#0645ad] bg-[#f0f7ff] shadow-md" 
                    : "border-[#e2e8f0] bg-white hover:border-[#a2a9b1]"
                }`}
              >
                <Bot size={28} className={aiProvider === "ollama" ? "text-[#0645ad]" : "text-[#54595d]"} />
                <div className="text-sm font-bold text-center">Ollama Pro / Local</div>
                <div className="text-[10px] text-[#54595d] text-center">자체 호스팅 & Cloud API</div>
              </div>
            </div>
          </div>

          {/* GitHub Copilot Integration Section */}
          {aiProvider === "github_copilot" && (
            <div className="bg-[#f0f7ff] border border-[#0645ad]/20 rounded-md p-5 mb-2 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-[#0645ad] flex items-center uppercase tracking-wider">
                  <GithubIcon size={18} className="mr-2" /> GitHub Copilot 통합
                </h3>
                <button 
                  onClick={() => {
                    setTutorialProvider("github_copilot");
                    setShowTutorial(true);
                  }}
                  className="text-[11px] font-bold text-[#0645ad] flex items-center gap-1 hover:underline bg-white px-2 py-1 rounded border border-[#0645ad]/10"
                >
                  <HelpCircle size={12} /> 설정 안내
                </button>
              </div>
              
              <p className="text-[#54595d] text-[12px] mb-4 leading-relaxed">
                AutoWiki는 사용자의 Copilot 권한을 사용해 문서를 생성합니다. 별도의 토큰 발급 없이 GitHub 로그인을 통해 안전하게 연결할 수 있습니다.
              </p>

              <div className="space-y-4">
                {isGithubLinked ? (
                  <div className="flex items-center justify-between bg-white border border-[#00af89]/30 rounded-lg p-3 shadow-sm gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#00af89]/10 rounded-full flex items-center justify-center shrink-0">
                        <CheckCircle2 className="text-[#00af89]" size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-[#00af89]">GitHub 계정과 연결됨</div>
                        <div className="text-[10px] sm:text-[11px] text-[#54595d] font-medium">
                          서버와 안전하게 세션이 유지되고 있습니다.
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={handleDisconnect}
                      className="p-2 text-[#54595d] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0"
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
                            className="text-2xl sm:text-4xl font-black text-[#0645ad] tracking-[0.1em] sm:tracking-[0.2em] bg-[#f8fafc] px-4 sm:px-8 py-4 sm:py-5 rounded-xl sm:rounded-2xl border-2 border-dashed border-[#0645ad]/20 cursor-pointer hover:border-[#0645ad]/40 transition-all flex items-center justify-center gap-2 sm:gap-3 group"
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
          )}

          {/* Ollama Cloud & Local Integration Section */}
          {aiProvider === "ollama" && (
            <div className="bg-[#fcf8f2] border border-[#d6a45c]/30 rounded-md p-5 mb-2 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-[#b87014] flex items-center uppercase tracking-wider">
                  <Bot size={18} className="mr-2 text-[#b87014]" /> Ollama Cloud & Local 통합
                </h3>
                <button 
                  onClick={() => {
                    setTutorialProvider("ollama");
                    setShowTutorial(true);
                  }}
                  className="text-[11px] font-bold text-[#b87014] flex items-center gap-1 hover:underline bg-white px-2 py-1 rounded border border-[#d6a45c]/25"
                >
                  <HelpCircle size={12} /> 설정 안내
                </button>
              </div>
              
              <p className="text-[#54595d] text-[12px] mb-4 leading-relaxed">
                로컬에 실행 중인 Ollama 서버 또는 Ollama Cloud API를 연동합니다. 
                <br />
                <b>중요 보안 수칙:</b> API Key는 절대 노출되지 않으며 백엔드 데이터베이스에 강력하게 암호화(AES-256)되어 보관됩니다.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-[#202122]">
                    Ollama Host URL
                  </label>
                  <input
                    type="text"
                    value={ollamaHost}
                    onChange={(e) => setOllamaHost(e.target.value)}
                    placeholder="예: http://localhost:11434 또는 https://ollama.com"
                    className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[14px] shadow-inner"
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setOllamaHost("http://localhost:11434")}
                      className="text-[10px] text-[#0645ad] hover:underline bg-white px-2 py-0.5 rounded border border-[#a2a9b1]/30"
                    >
                      로컬 기본값 (http://localhost:11434)
                    </button>
                    <button 
                      type="button"
                      onClick={() => setOllamaHost("https://ollama.com")}
                      className="text-[10px] text-[#0645ad] hover:underline bg-white px-2 py-0.5 rounded border border-[#a2a9b1]/30"
                    >
                      Cloud 기본값 (https://ollama.com)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1 text-[#202122] flex items-center justify-between">
                    <span>Ollama API Key</span>
                    {hasOllamaKey && (
                      <span className="text-[10px] text-[#00af89] font-bold">API Key 저장됨</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={ollamaApiKey}
                      onChange={(e) => setOllamaApiKey(e.target.value)}
                      placeholder={hasOllamaKey ? "******** (보안 암호화 저장됨 - 변경하려면 새 키 입력)" : "API Key를 입력하세요 (필요 시)"}
                      className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm pl-3 pr-10 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[14px] shadow-inner"
                    />
                    {ollamaApiKey && (
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-2.5 text-[#54595d] hover:text-[#202122]"
                      >
                        {showApiKey ? (
                          <span className="text-xs">숨기기</span>
                        ) : (
                          <span className="text-xs">보기</span>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#54595d] mt-1">
                    * 로컬 Ollama를 사용하는 경우 보통 API Key가 필요하지 않으며 비워두시면 됩니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-bold mb-1">
              AI 모델 지정
            </label>
            <p className="text-[#54595d] text-xs mb-2">원하는 AI 모델의 식별자를 정확히 입력해 주세요.</p>
            <input
              type="text"
              value={model}
              onChange={(e) => {
                const val = e.target.value;
                setModel(val);
                if (aiProvider === "github_copilot") {
                  setCopilotModel(val);
                } else {
                  setOllamaModel(val);
                }
              }}
              placeholder={aiProvider === "github_copilot" ? "예: gemini-3.1-pro-preview" : "예: llama3, mistral"}
              className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[16px] sm:text-sm shadow-inner"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-[#54595d] py-0.5">추천 모델:</span>
              {aiProvider === "github_copilot" ? (
                ["gemini-3.1-pro-preview", "gemini-3-pro", "o1-mini", "gpt-4o"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModel(m);
                      setCopilotModel(m);
                    }}
                    className="text-[10px] text-[#0645ad] hover:underline bg-[#f8f9fa] border border-[#a2a9b1]/30 rounded-sm px-1.5 py-0.5 animate-in fade-in"
                  >
                    {m}
                  </button>
                ))
              ) : (
                ["llama3", "llama3:70b", "mistral", "qwen2.5", "phi3"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModel(m);
                      setOllamaModel(m);
                    }}
                    className="text-[10px] text-[#0645ad] hover:underline bg-[#f8f9fa] border border-[#a2a9b1]/30 rounded-sm px-1.5 py-0.5 animate-in fade-in"
                  >
                    {m}
                  </button>
                ))
              )}
            </div>
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
              onChange={(e) => {
                const val = e.target.value;
                setSubModel(val);
                if (aiProvider === "github_copilot") {
                  setCopilotSubModel(val);
                } else {
                  setOllamaSubModel(val);
                }
              }}
              placeholder={aiProvider === "github_copilot" ? "예: gemini-3-flash-preview" : "예: llama3, gemma2:2b"}
              className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[16px] sm:text-sm shadow-inner"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-[#54595d] py-0.5">추천 모델:</span>
              {aiProvider === "github_copilot" ? (
                ["gemini-3-flash-preview", "gemini-3-flash", "gpt-4o-mini"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setSubModel(m);
                      setCopilotSubModel(m);
                    }}
                    className="text-[10px] text-[#0645ad] hover:underline bg-[#f8f9fa] border border-[#a2a9b1]/30 rounded-sm px-1.5 py-0.5 animate-in fade-in"
                  >
                    {m}
                  </button>
                ))
              ) : (
                ["llama3", "gemma2", "phi3", "qwen2.5:1.5b"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setSubModel(m);
                      setOllamaSubModel(m);
                    }}
                    className="text-[10px] text-[#0645ad] hover:underline bg-[#f8f9fa] border border-[#a2a9b1]/30 rounded-sm px-1.5 py-0.5 animate-in fade-in"
                  >
                    {m}
                  </button>
                ))
              )}
            </div>
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
                className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[#0645ad] text-[16px] sm:text-sm"
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
                className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[#0645ad] text-[16px] sm:text-sm"
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

          <div className="mt-4 bg-[#eaecf0] border border-[#a2a9b1] p-3 rounded-sm flex items-start text-[12px] text-[#202122]">
            <AlertCircle size={16} className="mr-2 shrink-0 mt-0.5 text-[#0645ad]" />
            <p>
              <b>개인정보 보호:</b> 모든 자격 증명 정보는 강력하게 암호화(AES-256)되어 서버에 안전하게 보관됩니다. 브라우저의 로컬 저장소에는 민감한 키 원본이 노출되거나 저장되지 않으므로 안심하고 사용하실 수 있습니다.
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
            
            <div className="flex gap-2">
              <button
                onClick={handleResetConfig}
                className="bg-white hover:bg-gray-100 text-[#54595d] border border-[#a2a9b1] font-bold px-3 py-2 rounded-sm flex items-center transition-colors text-sm"
                title="기본 설정으로 되돌리기"
              >
                <RotateCcw size={14} className="mr-1.5" /> 기본값 복구
              </button>
              <button
                onClick={handleSave}
                className="bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold px-4 py-2 rounded-sm flex items-center transition-colors"
              >
                <Save size={16} className="mr-2" /> 구성 저장하기
              </button>
            </div>
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
                  className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[16px] sm:text-[13px] shadow-inner h-64 resize-y"
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
              
            <div className="flex gap-2">
              <button
                onClick={handleResetPrompts}
                className="bg-white hover:bg-gray-100 text-[#54595d] border border-[#a2a9b1] font-bold px-3 py-2 rounded-sm flex items-center transition-colors text-sm"
                title="권장 프롬프트로 복구"
              >
                <RotateCcw size={14} className="mr-1.5" /> 기본값 복구
              </button>
              <button
                onClick={handlePromptsSave}
                className="bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold px-4 py-2 rounded-sm flex items-center transition-colors"
              >
                <Save size={16} className="mr-2" /> 프롬프트 저장하기
              </button>
            </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showTutorial && (
          <SetupTutorial 
            initialProvider={tutorialProvider}
            onClose={() => {
              localStorage.setItem("autowiki_tutorial_seen", "true");
              setShowTutorial(false);
              setTutorialProvider(null);
            }} 
            onGoToSettings={() => {
              localStorage.setItem("autowiki_tutorial_seen", "true");
              setShowTutorial(false);
              setTutorialProvider(null);
              document.getElementById("sub-model-input")?.focus();
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
