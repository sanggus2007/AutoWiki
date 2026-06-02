"use client";

import React, { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { SetupTutorial } from "@/components/SetupTutorial";


interface ProjectItem {
  id: number;
  name: string;
  slug: string;
  description: string;
  doc_count: number;
  entity_count: number;
  created_date: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    // 토큰이 없으면 튜토리얼 자동 표시 (한 번도 안 본 경우만)
    const savedGithubToken = localStorage.getItem("autowiki_github_token");
    const tutorialSeen = localStorage.getItem("autowiki_tutorial_seen");
    if (!savedGithubToken && !tutorialSeen) {
      setShowTutorial(true);
    }
    apiFetch("/api/projects")
      .then(async r => {
        if (!r.ok) {
           if (r.status === 401) {
              // Redirect handled by apiFetch or DashboardLayout
           }
           throw new Error("failed to fetch projects");
        }
        return r.json();
      })
      .then(data => {
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error(err);
        setProjects([]);
      });
  }, []);

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

        {/* Right Column - Projects */}
        <div className="w-full md:w-80 flex flex-col">
          <div className="border border-[#a2a9b1] dark:border-zinc-800 bg-[#ffffff] dark:bg-zinc-900 rounded-sm">
            <h3 className="bg-[#eaecf0] dark:bg-zinc-800 border-b border-[#a2a9b1] dark:border-zinc-700 p-2 font-bold text-sm flex items-center justify-between text-black dark:text-white">
              <span>프로젝트 목록</span>
              <span className="text-[#54595d] dark:text-gray-400 font-normal text-[11px]">{projects.length}개</span>
            </h3>
            <div className="p-2">
              <ul className="space-y-2.5 text-[13px]">
                {projects.map((p) => (
                  <li key={p.id} className="border border-[#eaecf0] dark:border-zinc-800 p-2.5 hover:bg-[#f8f9fa] dark:hover:bg-zinc-800 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/project/${p.id}`)}>
                    <div className="flex items-start">
                      <FolderOpen size={16} className="text-[#0645ad] dark:text-blue-400 mr-2 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#0645ad] dark:text-blue-400 hover:underline font-bold truncate">{p.name}</div>
                        <div className="text-[11px] text-[#54595d] dark:text-gray-400 mt-1 flex items-center space-x-3">
                          <span>파일 {p.doc_count}건</span>
                          <span>문서 {p.entity_count}건</span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {projects.length === 0 && (
                  <li className="text-[#54595d] dark:text-gray-400 italic text-center py-4">
                    아직 프로젝트가 없습니다.<br/>
                    <span className="text-[11px]">좌측 사이드바에서 「＋」버튼으로 생성하세요.</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showTutorial && (
        <SetupTutorial 
          onClose={() => {
            localStorage.setItem("autowiki_tutorial_seen", "true");
            setShowTutorial(false);
          }} 
          onGoToSettings={() => {
            localStorage.setItem("autowiki_tutorial_seen", "true");
            router.push('/dashboard/settings');
          }} 
        />
      )}
    </div>
  );
}
