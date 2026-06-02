"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2 } from "lucide-react";

interface LoadingScreenProps {
  onComplete: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "문서 메타데이터 로드 중...",
    "문맥 및 핵심 주제어 분석 중...",
    "위키 문서 노드(Node) 추출 기획 중...",
    "엔티티 간의 관계(Edge) 맵핑 중...",
    "AI 플래너의 최종 응답을 대기 중..."
  ];

  useEffect(() => {
    // Asymptotic progress towards 99%
    const intervalTime = 150;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const diff = 99 - prev;
        const inc = Math.max(diff * 0.05, 0.1); 
        const next = Math.min(prev + inc, 99);
        
        if (next < 30) setCurrentStep(0);
        else if (next < 50) setCurrentStep(1);
        else if (next < 70) setCurrentStep(2);
        else if (next < 85) setCurrentStep(3);
        else setCurrentStep(4);
        
        return next;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-2xl bg-white dark:bg-[#1a1b1c] border border-[#a2a9b1] dark:border-zinc-800 rounded shadow-sm p-10 font-sans transition-colors duration-200">
      <div className="mb-6 flex flex-col items-center">
        <Loader2 className="w-12 h-12 text-[#0645ad] dark:text-blue-400 animate-spin mb-4" />
        <h2 className="text-2xl font-bold text-[#000000] dark:text-[#eaecf0] mb-2 tracking-tight">AI가 대상 문서를 분석 및 기획 중입니다</h2>
        <p className="text-[#202122] dark:text-[#eaecf0] flex items-center bg-[#eaecf0] dark:bg-zinc-800 px-4 py-2 rounded text-sm font-medium border border-[#a2a9b1] dark:border-zinc-700">
          <Search size={14} className="mr-2 text-[#0645ad] dark:text-blue-400" />
          현재 단계: {steps[currentStep]}
        </p>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full max-w-md h-3 bg-[#eaecf0] dark:bg-zinc-800 rounded-full overflow-hidden border border-[#cccccc] dark:border-zinc-700">
        <motion.div 
          className="h-full bg-[#0645ad] dark:bg-blue-600"
          style={{ width: `${progress}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 text-xs font-bold text-[#54595d] dark:text-gray-400 w-full max-w-md text-right">
        {Math.round(progress)}% 완료
      </div>
      
      <div className="mt-8 pt-4 border-t border-[#eaecf0] dark:border-zinc-800 w-full text-center">
         <p className="text-xs text-[#54595d] dark:text-gray-400">
           잠시만 기다려 주십시오. 이 작업은 문서의 크기에 따라 <br /> 수 초에서 최대 1~2분이 소요될 수 있습니다.
         </p>
      </div>
    </div>
  );
};
