"use client";
 
import React from "react";
import { Loader2 } from "lucide-react";
 
interface LoadingScreenProps {
  onComplete: () => void;
}
 
export const LoadingScreen: React.FC<LoadingScreenProps> = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-2xl bg-white dark:bg-[#1a1b1c] border border-[#a2a9b1] dark:border-zinc-800 rounded shadow-sm p-10 font-sans transition-colors duration-200">
      <div className="mb-6 flex flex-col items-center">
        <Loader2 className="w-12 h-12 text-[#0645ad] dark:text-blue-400 animate-spin mb-4" />
        <h2 className="text-2xl font-bold text-[#000000] dark:text-[#eaecf0] mb-2 tracking-tight">AI가 대상 문서를 분석 및 기획 중입니다</h2>
      </div>
      
      <div className="mt-8 pt-4 border-t border-[#eaecf0] dark:border-zinc-800 w-full text-center">
         <p className="text-xs text-[#54595d] dark:text-gray-400">
           잠시만 기다려 주십시오. 이 작업은 문서의 크기에 따라 <br /> 수 초에서 최대 1~2분이 소요될 수 있습니다.
         </p>
      </div>
    </div>
  );
};
