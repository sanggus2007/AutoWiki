"use client";

import React, { useState } from "react";
import { Send, Sparkles, Zap, ChevronDown, Settings, X } from "lucide-react";

interface TextInputUIProps {
  onSubmit: (text: string, useSubModel: boolean, includeEntities: boolean, includeGraph: boolean, includeFiles: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  placeholder?: string;
  buttonText?: string;
  hideHeader?: boolean;
  clearOnSubmit?: boolean;
  isChat?: boolean;
}

export const TextInputUI: React.FC<TextInputUIProps> = ({ 
  onSubmit, 
  title = "AI에게 직접 지시", 
  description, 
  placeholder, 
  buttonText = "AI에게 전송",
  hideHeader = false,
  clearOnSubmit = true,
  isChat = false
}) => {
  const [text, setText] = useState("");
  const [useSubModel, setUseSubModel] = useState(false);
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);
  
  const [includeEntities, setIncludeEntities] = useState(true);
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);

  const mainModel = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_model")) || "gpt-4o";
  const subModel  = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_sub_model")) || "gpt-4o-mini";

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed, useSubModel, includeEntities, includeGraph, includeFiles);
    if (clearOnSubmit) setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (isChat) {
        // In chat mode, regular Enter sends the message (Ctrl+Enter is also supported)
        e.preventDefault();
        handleSubmit();
      } else if (e.ctrlKey || e.metaKey) {
        // In regular page mode, Ctrl+Enter sends the message
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const defaultDescription = (
    <>
      파일 없이도 텍스트로 AI에게 문서 수정 및 추가를 지시할 수 있습니다.<br />
      기존 문서 목록을 참고하여 수정이 필요한 부분을 자동으로 파악합니다.
    </>
  );

  const defaultPlaceholder = "예시:\n- '양자 컴퓨팅' 개념을 새로 추가해줘.\n- '앨런 튜링' 문서의 소속 항목을 '블레츨리 파크'로 업데이트해줘.\n\n(모바일은 '전송' 버튼 클릭 / PC는 Ctrl+Enter)";

  // ── Render Compact Chat Input Mode ──────────────────────────────────────
  if (isChat) {
    return (
      <div className="w-full space-y-2 font-sans">
        {/* Collapsible Options Drawer - Placed ABOVE the input box */}
        {showChatOptions && (
          <div className="bg-[#f8f9fa] dark:bg-zinc-900 border border-[#eaecf0] dark:border-zinc-800 rounded-lg p-3 text-[11px] sm:text-[12px] space-y-2.5 animate-in slide-in-from-bottom-2 duration-200 shadow-inner">
            <div className="flex items-center justify-between border-b border-[#eaecf0] dark:border-zinc-800 pb-1.5 mb-1 flex-wrap gap-2">
              <span className="font-bold text-[#202122] dark:text-gray-100 flex items-center gap-1.5">
                <Sparkles size={12} className="text-[#0645ad] dark:text-zinc-400" /> AI 모델 및 참고 맥락 구성
              </span>
              <button 
                onClick={() => setShowChatOptions(false)} 
                className="text-[#888] hover:text-slate-900 dark:hover:text-white p-0.5"
              >
                <X size={12} />
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-[#54595d] dark:text-zinc-300 mr-1">모델 선택:</span>
              <button
                onClick={() => setUseSubModel(false)}
                className={`px-2 py-0.5 rounded-full border text-[11px] font-black transition-colors ${
                  !useSubModel ? "bg-[#0645ad] dark:bg-zinc-200 dark:text-zinc-900 border-[#0645ad] dark:border-zinc-200" : "bg-white dark:bg-zinc-900 text-[#54595d] dark:text-zinc-400 border-[#c8ccd1] dark:border-zinc-800"
                }`}
              >
                메인 ({mainModel})
              </button>
              <button
                onClick={() => setUseSubModel(true)}
                className={`px-2 py-0.5 rounded-full border text-[11px] font-black transition-colors ${
                  useSubModel ? "bg-[#0645ad] dark:bg-zinc-200 dark:text-zinc-900 border-[#0645ad] dark:border-zinc-200" : "bg-white dark:bg-zinc-900 text-[#54595d] dark:text-zinc-400 border-[#c8ccd1] dark:border-zinc-800"
                }`}
              >
                보조 ({subModel})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-bold text-[#54595d] dark:text-zinc-300 mr-1">참고 맥락:</span>
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input type="checkbox" checked={includeEntities} onChange={e => setIncludeEntities(e.target.checked)} className="w-3.5 h-3.5 accent-[#0645ad] dark:accent-zinc-500 cursor-pointer" />
                <span className="text-[#54595d] dark:text-zinc-300 group-hover:text-[#202122] dark:group-hover:text-white transition-colors font-medium">기존 문서</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input type="checkbox" checked={includeGraph} onChange={e => setIncludeGraph(e.target.checked)} className="w-3.5 h-3.5 accent-[#0645ad] dark:accent-zinc-500 cursor-pointer" />
                <span className="text-[#54595d] dark:text-zinc-300 group-hover:text-[#202122] dark:group-hover:text-white transition-colors font-medium">관계도</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input type="checkbox" checked={includeFiles} onChange={e => setIncludeFiles(e.target.checked)} className="w-3.5 h-3.5 accent-[#0645ad] dark:accent-zinc-500 cursor-pointer" />
                <span className="text-[#54595d] dark:text-zinc-300 group-hover:text-[#202122] dark:group-hover:text-white transition-colors font-medium">첨부 파일</span>
              </label>
            </div>
          </div>
        )}

        <div className="flex items-end gap-1 sm:gap-1.5 bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 rounded-lg p-1 sm:p-1.5 focus-within:border-[#0645ad] dark:focus-within:border-zinc-500 transition-colors shadow-sm">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={placeholder || "질문을 입력하세요"}
            className="flex-1 min-w-0 min-h-[36px] max-h-[120px] px-2 py-1.5 sm:px-3 text-[14px] sm:text-[13.5px] text-[#202122] dark:text-zinc-200 resize-none focus:outline-none leading-relaxed bg-transparent"
          />
          
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 pb-0.5">
            {/* Options Toggle Gear Icon */}
            <button
              type="button"
              onClick={() => setShowChatOptions(p => !p)}
              className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                showChatOptions ? "text-[#0645ad] dark:text-zinc-200 bg-blue-50 dark:bg-zinc-800" : "text-[#54595d] dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
              }`}
              title="AI 분석 옵션 설정"
            >
              <Settings size={16} className="sm:hidden" />
              <Settings size={17} className="hidden sm:block" />
            </button>
            
            {/* Send Button */}
            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="p-1.5 sm:p-2 bg-[#0645ad] dark:bg-zinc-200 dark:text-zinc-900 rounded-md hover:bg-[#0b0080] dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              title="보내기"
            >
              <Send size={14} className="sm:hidden" />
              <Send size={15} className="hidden sm:block" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Normal Page direct-instruct Mode ─────────────────────────────
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 font-sans">
      {!hideHeader && (
        <div className="text-center mb-2">
          <h2 className="text-xl font-bold text-[#202122] dark:text-white mb-1">{title}</h2>
          <p className="text-[13px] text-[#54595d] dark:text-gray-300">
            {description || defaultDescription}
          </p>
        </div>
      )}

      <div className="border border-[#a2a9b1] dark:border-zinc-800 rounded-sm overflow-hidden shadow-sm focus-within:border-[#0645ad] dark:focus-within:border-zinc-500 transition-colors bg-white dark:bg-zinc-900">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={hideHeader ? 3 : 8}
          placeholder={placeholder || defaultPlaceholder}
          className="w-full px-4 py-3 text-[16px] sm:text-[13px] text-[#202122] dark:text-white resize-none focus:outline-none leading-relaxed bg-transparent"
        />

        <div className="border-t border-[#eaecf0] dark:border-zinc-800 bg-[#f8f9fa] dark:bg-zinc-950 px-3 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-1 border-r border-[#eaecf0] dark:border-zinc-800 pr-3 mr-1">
              <button
                onClick={() => setUseSubModel(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors border ${
                  !useSubModel ? "bg-[#0645ad] dark:bg-zinc-200 dark:text-zinc-900 border-[#0645ad] dark:border-zinc-200" : "bg-white dark:bg-zinc-900 text-[#54595d] dark:text-zinc-400 border-[#c8ccd1] dark:border-zinc-800 hover:border-[#0645ad] dark:hover:border-zinc-500"
                }`}
              >
                <Sparkles size={11} />
                메인 모델
              </button>
              <button
                onClick={() => setUseSubModel(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors border ${
                  useSubModel ? "bg-[#0645ad] dark:bg-zinc-200 dark:text-zinc-900 border-[#0645ad] dark:border-zinc-200" : "bg-white dark:bg-zinc-900 text-[#54595d] dark:text-zinc-400 border-[#c8ccd1] dark:border-zinc-800 hover:border-[#0645ad] dark:hover:border-zinc-500"
                }`}
              >
                <Zap size={11} />
                보조 모델
              </button>
              <button
                onClick={() => setShowModelInfo(p => !p)}
                className="ml-1 text-[#a2a9b1] dark:text-zinc-400 hover:text-[#54595d] dark:hover:text-white transition-colors"
                title="사용 모델 확인"
              >
                <ChevronDown size={13} className={`transition-transform ${showModelInfo ? "rotate-180" : ""}`} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[11px] text-[#72777d] dark:text-zinc-400 font-medium leading-none">AI가 참고할 맥락:</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input type="checkbox" checked={includeEntities} onChange={e => setIncludeEntities(e.target.checked)} className="w-3.5 h-3.5 accent-[#0645ad] dark:accent-zinc-500 cursor-pointer" />
                  <span className="text-[12px] text-[#54595d] dark:text-zinc-300 group-hover:text-[#202122] dark:group-hover:text-white transition-colors" title="기존 문서 내용을 참고합니다.">기존 문서</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input type="checkbox" checked={includeGraph} onChange={e => setIncludeGraph(e.target.checked)} className="w-3.5 h-3.5 accent-[#0645ad] dark:accent-zinc-500 cursor-pointer" />
                  <span className="text-[12px] text-[#54595d] dark:text-zinc-300 group-hover:text-[#202122] dark:group-hover:text-white transition-colors" title="문서 간 연결 관계를 참고합니다.">관계도 정보</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input type="checkbox" checked={includeFiles} onChange={e => setIncludeFiles(e.target.checked)} className="w-3.5 h-3.5 accent-[#0645ad] dark:accent-zinc-500 cursor-pointer" />
                  <span className="text-[12px] text-[#54595d] dark:text-zinc-300 group-hover:text-[#202122] dark:group-hover:text-white transition-colors" title="첨부 파일 본문을 참고합니다.">첨부 파일</span>
                </label>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0645ad] dark:bg-zinc-200 dark:text-zinc-900 font-bold text-[13px] rounded-sm hover:bg-[#0b0080] dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            <Send size={13} />
            {buttonText}
          </button>
        </div>
      </div>

      {showModelInfo && (
        <div className="text-[12px] text-[#54595d] dark:text-zinc-300 bg-[#f8f9fa] dark:bg-zinc-950 border border-[#eaecf0] dark:border-zinc-850 rounded-sm px-3 py-2 flex gap-4 transition-all">
          <div><span className="font-bold text-[#202122] dark:text-white">메인:</span> <span className="font-mono">{mainModel}</span></div>
          <div><span className="font-bold text-[#202122] dark:text-white">보조:</span> <span className="font-mono">{subModel}</span></div>
        </div>
      )}
    </div>
  );
};
