"use client";

import React, { useState, useCallback } from "react";
import { UploadCloud, File as FileIcon, X, BookOpen } from "lucide-react";

interface UploadUIProps {
  onStartIngestion: (files: File[], customPrompt: string, includeEntities: boolean, includeGraph: boolean, includeFiles: boolean) => void;
}

export const UploadUI: React.FC<UploadUIProps> = ({ onStartIngestion }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [includeEntities, setIncludeEntities] = useState(true);
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center font-sans">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-[#000000] dark:text-[#eaecf0] mb-3 tracking-tight">나만의 지식백과 구축하기</h1>
        <p className="text-gray-600 dark:text-gray-400">회의록, 논문 PDF, 파편화된 메모들을 업로드하세요.<br />AI가 분석하여 서로 연결된 위키 문서로 생성합니다.</p>
      </div>

      <div
        className={`w-full p-10 bg-white dark:bg-[#1a1b1c] border-2 border-dashed rounded-lg transition-all duration-200 relative overflow-hidden flex flex-col items-center justify-center ${isDragging ? "border-[#0645ad] dark:border-blue-400 bg-[#f0f4f8] dark:bg-blue-950/20" : "border-[#aaaaaa] dark:border-[#54595d] hover:border-[#666666] dark:hover:border-gray-400 shadow-sm"
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input type="file" multiple accept=".pdf,.txt,.csv,.docx" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
        <div className="text-[#0645ad] dark:text-blue-400 mb-3"><UploadCloud size={56} strokeWidth={1.5} /></div>
        <p className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1 px-4 text-center">파일을 선택하거나 이곳으로 드래그하세요</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">지원 형식: PDF, DOCX, TXT, CSV</p>
        <div className="px-5 py-2 rounded border border-[#cccccc] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] hover:bg-gray-100 dark:hover:bg-zinc-700 font-medium text-sm hidden sm:block">또는 클릭하여 파일 찾기</div>
      </div>

      {files.length > 0 && (
        <div className="w-full mt-8 bg-white dark:bg-[#1a1b1c] border border-[#a2a9b1] dark:border-zinc-800 p-5 rounded shadow-sm">
          <div className="flex justify-between items-center mb-4 border-b border-[#eaecf0] dark:border-zinc-800 pb-2">
            <h3 className="text-[#000000] dark:text-[#eaecf0] font-bold text-sm">업로드 준비된 파일 목록 ({files.length})</h3>
            <button onClick={() => setFiles([])} className="text-xs text-[#0645ad] dark:text-blue-400 hover:underline">모두 지우기</button>
          </div>

          <div className="space-y-2 max-h-[250px] overflow-y-auto mb-5 custom-scrollbar">
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <FileIcon size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />
                  <span className="text-sm text-[#202122] dark:text-[#eaecf0] font-medium truncate">{file.name}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  <button onClick={() => removeFile(i)} className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-red-500"><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-5">
            <label className="block text-[#202122] dark:text-[#eaecf0] font-bold text-sm mb-2">추가 지시사항 (선택사항)</label>
            <textarea className="w-full border border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] p-3 text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400 rounded-sm resize-none" rows={3} placeholder="추출하고 싶은 특정 항목이 있다면 적어주세요." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} />
          </div>

          <div className="mb-6 px-1">
            <p className="text-[12px] text-[#72777d] dark:text-gray-400 font-bold mb-2 uppercase">AI 분석 시 참고할 맥락:</p>
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={includeEntities} onChange={e => setIncludeEntities(e.target.checked)} className="w-4 h-4 accent-[#0645ad] dark:accent-blue-400 cursor-pointer" />
                <span className="text-sm font-medium text-[#54595d] dark:text-gray-400 group-hover:text-[#202122] dark:group-hover:text-[#eaecf0] transition-colors">기존 문서</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={includeGraph} onChange={e => setIncludeGraph(e.target.checked)} className="w-4 h-4 accent-[#0645ad] dark:accent-blue-400 cursor-pointer" />
                <span className="text-sm font-medium text-[#54595d] dark:text-gray-400 group-hover:text-[#202122] dark:group-hover:text-[#eaecf0] transition-colors">관계도 정보</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={includeFiles} onChange={e => setIncludeFiles(e.target.checked)} className="w-4 h-4 accent-[#0645ad] dark:accent-blue-400 cursor-pointer" />
                <span className="text-sm font-medium text-[#54595d] dark:text-gray-400 group-hover:text-[#202122] dark:group-hover:text-[#eaecf0] transition-colors">예전에 첨부한 파일</span>
              </label>
            </div>
          </div>

          <button
            className="w-full mt-10 py-3 rounded bg-[#0645ad] dark:bg-blue-600 text-white font-bold text-sm flex justify-center items-center space-x-2 hover:bg-[#0b0080] dark:hover:bg-blue-700 transition-colors disabled:bg-gray-400 dark:disabled:bg-zinc-800"
            onClick={() => onStartIngestion(files, customPrompt, includeEntities, includeGraph, includeFiles)}
          >
            <BookOpen size={16} />
            <span>위키 생성 시작</span>
          </button>
        </div>
      )}
    </div>
  );
};
