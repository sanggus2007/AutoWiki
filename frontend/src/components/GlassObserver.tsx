"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, BookOpen, Check, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Proposal } from "./ReviewUI";

interface GlassObserverProps {
  projectId: string;
  proposals: Proposal[];
  userPrompt: string;
  model: string;
  subModel: string;
  thinkingLevel: string;
  reasoningEffort: string;
  apiKey: string;
  onComplete: () => void;
  onCancel: (errorMsg: string) => void;
}

interface ParsedDoc {
  name: string;
  content: string;
}

const parseBatch = (batchText: string): ParsedDoc[] => {
  if (!batchText) return [];
  
  const separatorRegex = /===\s*DOCUMENT_SEPARATOR:\s*(.*?)\s*===/gi;
  const parts = batchText.split(separatorRegex);
  
  const docs: ParsedDoc[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    let name = parts[i].trim();
    while (name.startsWith("[") && name.endsWith("]")) {
      name = name.slice(1, -1).trim();
    }
    const content = parts[i + 1] ? parts[i + 1].trim() : "";
    docs.push({ name, content });
  }
  return docs;
};

export function GlassObserver({
  projectId,
  proposals,
  userPrompt,
  model,
  subModel,
  thinkingLevel,
  reasoningEffort,
  apiKey,
  onComplete,
  onCancel,
}: GlassObserverProps) {
  const [statusMessage, setStatusMessage] = useState("AI 작성 준비 중...");
  const [streamedText, setStreamedText] = useState("");
  const [completedDocs, setCompletedDocs] = useState<string[]>([]);
  const [currentWritingDoc, setCurrentWritingDoc] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [batches, setBatches] = useState<string[]>([]);
  
  const textEndRef = useRef<HTMLDivElement>(null);
  const docsEndRef = useRef<HTMLDivElement>(null);

  const currentWritingDocRef = useRef("");
  useEffect(() => {
    currentWritingDocRef.current = currentWritingDoc;
  }, [currentWritingDoc]);

  const getDocumentContent = (docName: string) => {
    let cleanDocName = docName.trim();
    while (cleanDocName.startsWith("[") && cleanDocName.endsWith("]")) {
      cleanDocName = cleanDocName.slice(1, -1).trim();
    }
    
    // Find the document across all batches
    for (const batchText of batches) {
      const docs = parseBatch(batchText);
      const matched = docs.find(d => d.name === cleanDocName);
      if (matched) {
        return matched.content;
      }
    }
    return "";
  };

  // 실시간 텍스트 스트림을 파싱하여 완성된 문서 목록을 실시간 추출
  useEffect(() => {
    if (!streamedText) return;

    const separatorRegex = /===\s*DOCUMENT_SEPARATOR:\s*(.*?)\s*===/g;
    const matches = Array.from(streamedText.matchAll(separatorRegex));
    
    if (matches.length > 0) {
      const docNames = matches.map(m => {
        let name = m[1].trim();
        while (name.startsWith("[") && name.endsWith("]")) {
          name = name.slice(1, -1).trim();
        }
        return name;
      });
      
      if (docNames.length > 1) {
        const completed = docNames.slice(0, -1);
        setCompletedDocs(prev => {
          const merged = Array.from(new Set([...prev, ...completed]));
          return merged;
        });
      }
      
      setCurrentWritingDoc(docNames[docNames.length - 1]);
    }
  }, [streamedText]);

  useEffect(() => {
    let active = true;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const startCommitStream = async () => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposals,
            custom_prompt: userPrompt,
            model_name: model,
            sub_model_name: subModel,
            thinking_level: thinkingLevel,
            reasoning_effort: reasoningEffort,
            api_key: apiKey,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "서버와 연결을 설정하지 못했습니다.");
        }

        reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let partialLine = "";

        if (!reader) {
          throw new Error("스트림 데이터를 로드하지 못했습니다.");
        }

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = (partialLine + chunk).split("\n");
          partialLine = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              try {
                const data = JSON.parse(dataStr);

                if (data.type === "status") {
                  setStatusMessage(data.message);
                } else if (data.type === "stream_start") {
                  // Keep streamed text cumulative across all batch generations to prevent race conditions and allow viewing earlier batch documents
                  setBatches((prev) => [...prev, ""]);
                } else if (data.type === "token") {
                  const content = data.content;
                  setStreamedText((prev) => prev + content);
                  setBatches((prev) => {
                    if (prev.length === 0) return [content];
                    const next = [...prev];
                    next[next.length - 1] += content;
                    return next;
                  });
                } else if (data.type === "stream_end") {
                  if (currentWritingDocRef.current) {
                    const cleanName = currentWritingDocRef.current.replace(/^\[|\]$/g, '');
                    setCompletedDocs(prev => Array.from(new Set([...prev, cleanName])));
                  }
                } else if (data.type === "done") {
                  if (currentWritingDocRef.current) {
                    const cleanName = currentWritingDocRef.current.replace(/^\[|\]$/g, '');
                    setCompletedDocs(prev => Array.from(new Set([...prev, cleanName])));
                  }
                  setStatusMessage("모든 문서 반영 완료");
                  setTimeout(() => {
                    if (active) onComplete();
                  }, 1200);
                  return;
                } else if (data.type === "error") {
                  throw new Error(data.message);
                }
              } catch (e: any) {
                console.error("Stream parse warning", e);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Commit stream error:", err);
        if (active) onCancel(err.message);
      }
    };

    startCommitStream();

    return () => {
      active = false;
      if (reader) {
        reader.cancel().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (selectedDoc === null) {
      textEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedText, selectedDoc]);

  useEffect(() => {
    docsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [completedDocs]);

  const getDisplayableText = () => {
    const allDocs = batches.flatMap(parseBatch);
    if (allDocs.length === 0) return "";
    return allDocs.map(doc => {
      return `📖 [문서 개시: ${doc.name}]\n----------------------------------------\n${doc.content}`;
    }).join("\n\n").trim();
  };

  return (
    <div className="w-full my-6 flex flex-col items-center">
      {/* 
        키프레임 애니메이션 및 마스킹 오버레이를 위한 임시 인라인 스타일 선언 
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes waveMove1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes waveMove2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes blinkOpacity {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.85; }
        }
        .brainwave-svg-1 {
          animation: waveMove1 16s linear infinite;
        }
        .brainwave-svg-2 {
          animation: waveMove2 11s linear infinite;
        }
        .brainwave-container {
          animation: blinkOpacity 4s ease-in-out infinite;
        }
      `}} />

      {/* 
        하얗고 투명한 화이트 글래스모피즘 미니멀리즘 카드 
      */}
      <div className="relative overflow-hidden backdrop-blur-3xl bg-white/30 dark:bg-zinc-900/30 border border-white/50 dark:border-zinc-800/50 rounded-3xl shadow-2xl p-8 max-w-5xl w-full mx-auto animate-in fade-in zoom-in-95 duration-500">
        
        {/* 미니멀 헤더 & 뇌파 연출 영역 */}
        <div className="flex flex-col gap-4 border-b border-slate-200/40 dark:border-zinc-800/40 pb-5 mb-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-slate-400 dark:text-slate-500" size={16} />
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight">지식 네트워크 통합 중</h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">{statusMessage}</p>
              </div>
            </div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-350 font-mono tracking-widest bg-white/40 dark:bg-zinc-800/40 border border-white/60 dark:border-zinc-700/60 px-2 py-0.5 rounded-full shadow-inner">
              {model}
            </div>
          </div>

          {/* 
            AI의 사고 회로가 활성화되어 연산하고 있음을 뜻하는 미니멀리즘 뇌파 연출 (Brainwave Waveform)
          */}
          <div className="relative w-full h-8 overflow-hidden bg-white/10 dark:bg-zinc-900/10 rounded-lg border border-white/30 dark:border-zinc-800/30 flex items-center justify-center shadow-inner">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-zinc-800/50 to-transparent opacity-20 pointer-events-none" />
            <div className="w-full h-full absolute inset-0 flex items-center justify-center brainwave-container">
              {/* 첫 번째 뇌파 라인 SVG */}
              <svg className="absolute top-0 left-0 w-[200%] h-full shrink-0 brainwave-svg-1" viewBox="0 0 2000 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path 
                  className="text-slate-500/25 dark:text-slate-400/30"
                  d="M 0 20 C 35 5, 90 5, 125 20 C 160 35, 215 35, 250 20 C 285 5, 340 5, 375 20 C 410 35, 465 35, 500 20 C 535 5, 590 5, 625 20 C 660 35, 715 35, 750 20 C 785 5, 840 5, 875 20 C 910 35, 965 35, 1000 20 C 1035 5, 1090 5, 1125 20 C 1160 35, 1215 35, 1250 20 C 1285 5, 1340 5, 1375 20 C 1410 35, 1465 35, 1500 20 C 1535 5, 1590 5, 1625 20 C 1660 35, 1715 35, 1750 20 C 1785 5, 1840 5, 1875 20 C 1910 35, 1965 35, 2000 20" 
                  stroke="currentColor" 
                  strokeWidth="1.5" 
                  strokeLinecap="round"
                />
              </svg>
              {/* 두 번째 뇌파 라인 SVG */}
              <svg className="absolute top-0 left-0 w-[200%] h-full shrink-0 brainwave-svg-2" viewBox="0 0 2000 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path 
                  className="text-sky-400/35 dark:text-sky-400/50"
                  d="M 0 20 C 28 8, 72 8, 100 20 C 128 32, 172 32, 200 20 C 228 8, 272 8, 300 20 C 328 32, 372 32, 400 20 C 428 8, 472 8, 500 20 C 528 32, 572 32, 600 20 C 628 8, 672 8, 700 20 C 728 32, 772 32, 800 20 C 828 8, 872 8, 900 20 C 928 32, 972 32, 1000 20 C 1028 8, 1072 8, 1100 20 C 1128 32, 1172 32, 1200 20 C 1228 8, 1272 8, 1300 20 C 1328 32, 1372 32, 1400 20 C 1428 8, 1472 8, 1500 20 C 1528 32, 1572 32, 1600 20 C 1628 8, 1672 8, 1700 20 C 1728 32, 1772 32, 1800 20 C 1828 8, 1872 8, 1900 20 C 1928 32, 1972 32, 2000 20" 
                  stroke="currentColor" 
                  strokeWidth="1" 
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* 2열 레이아웃: 중앙(집필 텍스트 스트리밍), 우측(옆으로 쌓여가는 문서 카드) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* 중앙 (집필 텍스트 스트리밍) */}
          <div className="md:col-span-8 flex flex-col space-y-2 relative">
            <div className="flex items-center justify-between pl-1">
              <span className="text-[10px] font-bold text-slate-400/80 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                {selectedDoc === null ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span>실시간 작성 현황 (스트리밍)</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>문서 개별 조회: <strong className="text-slate-700 dark:text-slate-300 font-bold">{selectedDoc}</strong></span>
                  </>
                )}
              </span>
              {selectedDoc !== null && (
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  실시간 화면으로 복귀 →
                </button>
              )}
            </div>
            
            {/* 스트리밍 창 컨테이너 */}
            <div className="relative h-[26rem] w-full rounded-2xl bg-white/40 dark:bg-zinc-900/40 border border-white/60 dark:border-zinc-800/60 overflow-hidden shadow-sm">
              
              {/* 
                ★ 가장자리 불투명 마스킹 오버레이 (Vignette 효과) 
                텍스트가 위와 아래 가장자리에 스크롤 될 때, 하얗고 불투명한 유리 안개 속으로 유려하게 소멸되는 감성 연출
              */}
              <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-white/95 dark:from-zinc-900/95 via-white/80 dark:via-zinc-900/80 to-transparent pointer-events-none z-20 border-t rounded-t-2xl border-white/40 dark:border-zinc-800/40" />
              <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white/95 dark:from-zinc-900/95 via-white/80 dark:via-zinc-900/80 to-transparent pointer-events-none z-20 border-b rounded-b-2xl border-white/40 dark:border-zinc-800/40" />

              {/* 실제 마크다운 텍스트 렌더링 스크롤 보드 */}
              <div className="h-full w-full overflow-y-auto pt-10 pb-12 px-6 font-sans text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 selection:bg-slate-100/85 dark:selection:bg-zinc-800/85 scrollbar-thin scrollbar-thumb-slate-200/80 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                {selectedDoc === null ? (
                  streamedText ? (
                    <div className="whitespace-pre-wrap">
                      {getDisplayableText()}
                      <span className="inline-block w-1.5 h-3.5 bg-slate-400/60 dark:bg-slate-500/60 ml-1 animate-pulse" />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2">
                      <Loader2 className="animate-spin text-slate-300 dark:text-slate-600" size={20} />
                      <span className="text-xs tracking-wider font-semibold text-slate-400/80 dark:text-slate-500/80">데이터 조립 대기 중...</span>
                    </div>
                  )
                ) : (
                  <div className="whitespace-pre-wrap">
                    <div className="border-b border-slate-200/35 dark:border-zinc-800/35 pb-3 mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <BookOpen size={14} className="text-emerald-500 shrink-0" /> {selectedDoc}
                      </h3>
                    </div>
                    {getDocumentContent(selectedDoc) ? (
                      <div className="text-slate-700 dark:text-slate-300 text-[13.5px] leading-relaxed whitespace-pre-wrap select-text">
                        {getDocumentContent(selectedDoc)}
                      </div>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-550 italic">문서 내용을 로드할 수 없습니다.</span>
                    )}
                  </div>
                )}
                <div ref={textEndRef} />
              </div>
            </div>
          </div>

          {/* 우측 (옆에 쌓여가는 완성 문서들) */}
          <div className="md:col-span-4 flex flex-col space-y-2 h-full">
            <span className="text-[10px] font-bold text-slate-400/80 dark:text-slate-500 uppercase tracking-widest pl-1 flex items-center gap-1.5">
              완성된 문서 ({completedDocs.length})
            </span>

            {/* 완성 리스트 글래스 컨테이너 */}
            <div className="h-[26rem] w-full rounded-2xl bg-white/20 dark:bg-zinc-950/20 border border border-white/40 dark:border-zinc-800/40 p-4 overflow-y-auto shadow-inner scrollbar-thin scrollbar-thumb-slate-200/80 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              <div className="flex flex-col gap-2.5">
                {completedDocs.map((doc, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setSelectedDoc(doc)}
                    className={`w-full text-left bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3 text-xs font-semibold hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-right-3
                      \${selectedDoc === doc 
                        ? 'border-emerald-500 dark:border-emerald-400 text-emerald-600 dark:text-emerald-450 ring-2 ring-emerald-500/20' 
                        : 'border-white/90 dark:border-zinc-800/90 text-slate-700 dark:text-slate-350 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">{doc}</span>
                    </div>
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  </button>
                ))}

                {/* 현재 실시간 작성 진행 중인 노드 표시 */}
                {currentWritingDoc && !completedDocs.includes(currentWritingDoc) && (
                  <button 
                    onClick={() => setSelectedDoc(null)}
                    className={`w-full text-left backdrop-blur-sm border border-dashed rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3 text-xs font-semibold transition-all duration-300
                      \${selectedDoc === null 
                        ? 'border-blue-500 bg-blue-50/10 dark:border-blue-400 dark:bg-zinc-800/40 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20' 
                        : 'border-slate-300 dark:border-zinc-700 bg-white/40 dark:bg-zinc-900/40 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-zinc-600'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={13} className="text-slate-400/80 dark:text-slate-500 shrink-0 animate-bounce" />
                      <span className="truncate">{currentWritingDoc}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 font-medium animate-pulse">
                      작성 중...
                    </span>
                  </button>
                )}

                {completedDocs.length === 0 && !currentWritingDoc && (
                  <div className="h-72 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-center text-xs px-4">
                    <span className="font-semibold text-slate-400 dark:text-slate-550">완성된 문서 목록이</span>
                    <span className="text-[10px] text-slate-400/70 dark:text-slate-500/70 mt-1">여기에 차곡차곡 쌓입니다.</span>
                  </div>
                )}
                <div ref={docsEndRef} />
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
