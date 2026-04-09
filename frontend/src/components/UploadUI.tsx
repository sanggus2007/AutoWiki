"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { UploadCloud, File as FileIcon, X, BookOpen } from "lucide-react";

interface UploadUIProps {
  onStartIngestion: (files: File[], customPrompt: string) => void;
}

export const UploadUI: React.FC<UploadUIProps> = ({ onStartIngestion }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");

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
        <h1 className="text-4xl font-bold text-[#000000] mb-3 tracking-tight">
          나만의 지식백과 구축하기
        </h1>
        <p className="text-gray-600">
          회의록, 논문 PDF, 파편화된 메모들을 업로드하세요.<br/>
          AI가 분석하여 서로 유기적으로 연결된 위키 문서로 생성합니다.
        </p>
      </div>

      <div
        className={`w-full p-10 bg-white border-2 border-dashed rounded-lg transition-all duration-200 relative overflow-hidden flex flex-col items-center justify-center ${
          isDragging
            ? "border-[#0645ad] bg-[#f0f4f8]"
            : "border-[#aaaaaa] hover:border-[#666666] shadow-sm"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.txt,.csv,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileInput}
          title="파일 드롭"
        />
        
        <div className="text-[#0645ad] mb-3">
          <UploadCloud size={56} strokeWidth={1.5} />
        </div>
        <p className="text-lg font-bold text-gray-800 mb-1">
          이곳에 파일을 드래그 앤 드롭 하세요
        </p>
        <p className="text-sm text-gray-500 mb-5">
          지원 형식: PDF, DOCX, TXT, CSV (최대 50MB)
        </p>
        <div className="px-5 py-2 rounded border border-[#cccccc] bg-[#f8f9fa] text-[#202122] font-medium text-sm pointer-events-none shadow-sm cursor-pointer">
          또는 클릭하여 파일 찾기
        </div>
      </div>

      {files.length > 0 && (
        <div className="w-full mt-8 bg-white border border-[#a2a9b1] p-5 rounded shadow-sm">
          <div className="flex justify-between items-center mb-4 border-b border-[#eaecf0] pb-2">
            <h3 className="text-[#000000] font-bold text-sm">업로드 준비된 파일 목록 ({files.length})</h3>
            <button 
              onClick={() => setFiles([])}
              className="text-xs text-[#0645ad] hover:underline"
            >
              모두 지우기
            </button>
          </div>
          
          <div className="space-y-2 max-h-[250px] overflow-y-auto mb-5 custom-scrollbar">
            {files.map((file, i) => (
              <div 
                key={i}
                className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200"
              >
                <div className="flex items-center space-x-2 overflow-hidden">
                  <FileIcon size={16} className="text-gray-500 shrink-0" />
                  <span className="text-sm text-[#202122] font-medium truncate">{file.name}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  <button 
                    onClick={() => removeFile(i)}
                    className="p-1 rounded text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-5">
            <label className="block text-[#202122] font-bold text-sm mb-2">추가 지시사항 (선택사항)</label>
            <textarea
              className="w-full border border-[#a2a9b1] p-3 text-sm focus:outline-none focus:border-[#0645ad] rounded-sm resize-none"
              rows={3}
              placeholder="예: 특정 항목만 추출해 줘. 너무 길지 않게 요약해 줄래?"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
          </div>

          <button
            className="w-full py-3 rounded bg-[#0645ad] text-white font-bold text-sm flex justify-center items-center space-x-2 hover:bg-[#0b0080] transition-colors"
            onClick={() => onStartIngestion(files, customPrompt)}
          >
            <BookOpen size={16} />
            <span>위키 생성 시작</span>
          </button>
        </div>
      )}
    </div>
  );
};
