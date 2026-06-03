"use client";
 
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupTutorial } from "@/components/SetupTutorial";
import { useAuthStore } from "@/lib/store";
 
export default function DashboardPage() {
  const router = useRouter();
  const [showTutorial, setShowTutorial] = useState(false);
  const { user } = useAuthStore();
 
  useEffect(() => {
    if (!user) return;
    const tutorialKey = `autowiki_tutorial_seen_${user.id}`;
    const tutorialSeen = localStorage.getItem(tutorialKey) || localStorage.getItem("autowiki_tutorial_seen");
    if (!tutorialSeen) {
      setShowTutorial(true);
    }
  }, [user]);
 
  return (
    <div className="p-4 sm:p-6 max-w-5xl bg-white dark:bg-[#121212] min-h-screen text-[#202122] dark:text-[#eaecf0] font-sans mx-auto transition-colors duration-200">
      <div className="border-b border-[#a2a9b1] dark:border-zinc-800 mb-4 pb-2">
        <h1 className="text-3xl font-serif font-medium mb-1 text-black dark:text-white">대문</h1>
        <p className="text-sm text-[#54595d] dark:text-gray-400">AutoWiki AI — 자동 생성 개인 백과사전</p>
      </div>
 
      <div className="flex flex-col md:flex-row gap-6 mt-4">
        {/* Left Column */}
        <div className="flex-1">
          <div className="bg-[#f8f9fa] dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 p-5 mb-5 rounded-sm">
            <h2 className="text-xl font-bold border-b border-[#a2a9b1] dark:border-zinc-800 pb-2 mb-3 text-black dark:text-white">AutoWiki AI에 오신 것을 환영합니다</h2>
            <p className="text-[15px] leading-relaxed mb-4">
              이곳은 사용자가 업로드한 문서를 바탕으로 AI가 자동으로 구축한 <b>지식 백과사전</b>입니다.<br/>
              시작하려면 좌측 사이드바에서 <b>프로젝트를 생성</b>한 후, 해당 프로젝트 내에서 파일을 업로드하세요.
            </p>
          </div>
        </div>
      </div>
 
      {showTutorial && (
        <SetupTutorial 
          userId={user?.id}
          onClose={() => {
            if (user) {
              localStorage.setItem(`autowiki_tutorial_seen_${user.id}`, "true");
            }
            localStorage.setItem("autowiki_tutorial_seen", "true");
            setShowTutorial(false);
          }} 
          onGoToSettings={() => {
            if (user) {
              localStorage.setItem(`autowiki_tutorial_seen_${user.id}`, "true");
            }
            localStorage.setItem("autowiki_tutorial_seen", "true");
            router.push('/dashboard/settings');
          }} 
        />
      )}
    </div>
  );
}
