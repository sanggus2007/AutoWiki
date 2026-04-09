"use client";

import React, { useState, useEffect } from "react";
import { Key, Bot, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";


export default function SettingsPage() {
  const [model, setModel] = useState("gemini-1.5-pro");
  const [subModel, setSubModel] = useState("gpt-4o-mini");
  const [thinkingLevel, setThinkingLevel] = useState("MEDIUM");
  const [reasoningEffort, setReasoningEffort] = useState("medium");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [prompts, setPrompts] = useState<{key: string, name: string, content: string, description: string}[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsSaved, setPromptsSaved] = useState(false);

  useEffect(() => {
    // Load existing settings
    const savedModel = localStorage.getItem("autowiki_llm_model");
    const savedKey = localStorage.getItem("autowiki_llm_api_key");
    if (savedModel) setModel(savedModel);
    if (savedKey) setApiKey(savedKey);
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
    localStorage.setItem("autowiki_llm_api_key", apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
          <div>
            <label className="block text-sm font-bold mb-1 flex justify-between">
              <span>API 키</span>
              {model.includes('local') && <span className="text-[#54595d] text-xs font-normal">로컬 모델은 키가 필요하지 않습니다</span>}
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-[#54595d]" size={16} />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={model.includes('local') ? "해당 없음" : "sk-..."}
                disabled={model.includes('local')}
                className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm pl-9 pr-3 py-2 focus:outline-none focus:border-[#0645ad] transition-all disabled:bg-[#eaecf0] shadow-inner"
              />
            </div>
            <div className="mt-3 bg-[#eaecf0] border border-[#a2a9b1] p-3 rounded-sm flex items-start text-[13px] text-[#202122]">
              <AlertCircle size={16} className="mr-2 shrink-0 mt-0.5 text-[#0645ad]" />
              <p>
                <b>개인정보 보호:</b> 입력하신 API 키는 브라우저의 로컬 스토리지에 안전하게 저장되며, 텍스트 분석 시 허가된 AI 제공자에게만 안전하게 전송됩니다. 해당 키는 당사 서버에 저장되지 않습니다.
              </p>
            </div>
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
    </div>
  );
}
