"use client";

import React, { useState } from "react";
import { Send, Sparkles, Zap, ChevronDown } from "lucide-react";

interface TextInputUIProps {
  onSubmit: (text: string, useSubModel: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  placeholder?: string;
  buttonText?: string;
  hideHeader?: boolean;
  clearOnSubmit?: boolean;
}

export const TextInputUI: React.FC<TextInputUIProps> = ({ 
  onSubmit, 
  title = "AI에게 직접 지시", 
  description, 
  placeholder, 
  buttonText = "AI에게 전송",
  hideHeader = false,
  clearOnSubmit = true
}) => {
  const [text, setText] = useState("");
  const [useSubModel, setUseSubModel] = useState(false);
  const [showModelInfo, setShowModelInfo] = useState(false);

  const mainModel = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_model")) || "gpt-4o";
  const subModel  = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_sub_model")) || "gpt-4o-mini";
  const activeModel = useSubModel ? subModel : mainModel;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed, useSubModel);
    if (clearOnSubmit) {
      setText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const defaultDescription = (
    <>
      파일 없이도 텍스트로 AI에게 문서 수정·추가를 지시할 수 있습니다.<br />
      기존 문서 목록을 참고하여 수정이 필요한 부분을 자동으로 파악합니다.
    </>
  );

  const defaultPlaceholder = `예시:\n• '양자 컴퓨팅' 개념을 새로 추가해줘.\n• '앨런 튜링' 문서의 소속 항목을 '블레츨리 파크'로 업데이트해줘.\n\n(모바일은 '전송' 버튼 클릭 / PC는 Ctrl+Enter)`;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {!hideHeader && (
        <div className="text-center mb-2">
          <h2 className="text-xl font-bold text-[#202122] mb-1">{title}</h2>
          <p className="text-[13px] text-[#54595d]">
            {description || defaultDescription}
          </p>
        </div>
      )}

      {/* Textarea */}
      <div className="border border-[#a2a9b1] rounded-sm overflow-hidden shadow-sm focus-within:border-[#0645ad] transition-colors bg-white">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={hideHeader ? 3 : 8}
          placeholder={placeholder || defaultPlaceholder}
          className="w-full px-4 py-3 text-[13px] text-[#202122] resize-none focus:outline-none leading-relaxed"
        />

        {/* Bottom bar inside textarea card */}
        <div className="border-t border-[#eaecf0] bg-[#f8f9fa] px-3 py-2 flex items-center justify-between">

          {/* Model selector */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setUseSubModel(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors border ${
                !useSubModel
                  ? "bg-[#0645ad] text-white border-[#0645ad]"
                  : "bg-white text-[#54595d] border-[#c8ccd1] hover:border-[#0645ad]"
              }`}
            >
              <Sparkles size={11} />
              메인 모델
            </button>
            <button
              onClick={() => setUseSubModel(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors border ${
                useSubModel
                  ? "bg-[#0645ad] text-white border-[#0645ad]"
                  : "bg-white text-[#54595d] border-[#c8ccd1] hover:border-[#0645ad]"
              }`}
            >
              <Zap size={11} />
              보조 모델
            </button>
            <button
              onClick={() => setShowModelInfo(p => !p)}
              className="ml-1 text-[#a2a9b1] hover:text-[#54595d] transition-colors"
              title="사용 모델 확인"
            >
              <ChevronDown size={13} className={`transition-transform ${showModelInfo ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0645ad] text-white font-bold text-[13px] rounded-sm hover:bg-[#0b0080] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={13} />
            {buttonText}
          </button>
        </div>
      </div>

      {/* Model info tooltip */}
      {showModelInfo && (
        <div className="text-[12px] text-[#54595d] bg-[#f8f9fa] border border-[#eaecf0] rounded-sm px-3 py-2 flex gap-4">
          <div>
            <span className="font-bold text-[#202122]">메인 모델:</span>{" "}
            <span className="font-mono">{mainModel}</span>
            <span className="ml-1 text-[#78716c]">— 복잡한 지시, 고품질 분석에 적합</span>
          </div>
          <div>
            <span className="font-bold text-[#202122]">보조 모델:</span>{" "}
            <span className="font-mono">{subModel}</span>
            <span className="ml-1 text-[#78716c]">— 간단한 지시, 빠르고 저렴</span>
          </div>
        </div>
      )}
    </div>
  );
};

