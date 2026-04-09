"use client";

import React, { useEffect, useState } from "react";
import { FolderOpen, ArrowRight, Share2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Network as NetworkIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";


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

  useEffect(() => {
    apiFetch("/api/projects")
      .then(r => r.json())
      .then(data => setProjects(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="p-6 max-w-5xl bg-white min-h-screen text-[#202122] font-sans">
      <div className="border-b border-[#a2a9b1] mb-4 pb-2">
        <h1 className="text-3xl font-serif font-medium mb-1">대문</h1>
        <p className="text-sm text-[#54595d]">AutoWiki AI — 자동 생성 개인 백과사전</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-4">
        {/* Left Column */}
        <div className="flex-1">
          <div className="bg-[#f8f9fa] border border-[#a2a9b1] p-5 mb-5 rounded-sm">
            <h2 className="text-xl font-bold border-b border-[#a2a9b1] pb-2 mb-3">AutoWiki AI에 오신 것을 환영합니다</h2>
            <p className="text-[15px] leading-relaxed mb-4">
              이곳은 사용자가 업로드한 문서를 바탕으로 AI가 자동으로 구축한 <b>지식 백과사전</b>입니다.<br/>
              시작하려면 좌측 사이드바에서 <b>프로젝트를 생성</b>한 후, 해당 프로젝트 내에서 파일을 업로드하세요.
            </p>
          </div>

          {/* Graph Preview */}
          <div className="border border-[#a2a9b1] p-5 rounded-sm mb-5">
            <div className="flex items-center justify-between border-b border-[#a2a9b1] pb-2 mb-3">
              <h2 className="text-lg font-bold flex items-center">
                <Share2 className="mr-2 text-[#54595d]" size={18} />
                전체 지식 구조도
              </h2>
              <button 
                onClick={() => router.push('/dashboard/graph')}
                className="text-sm text-[#0645ad] hover:underline flex items-center"
              >
                전체 그래프 보기 <ArrowRight size={14} className="ml-1" />
              </button>
            </div>
            <div 
              onClick={() => router.push('/dashboard/graph')}
              className="w-full h-36 bg-[#f8f9fa] border border-[#eaecf0] flex items-center justify-center cursor-pointer hover:bg-[#f0f4f8] transition-colors"
            >
              <div className="text-center">
                <NetworkIcon className="mx-auto text-[#0645ad] mb-2 opacity-50" size={28} />
                <p className="text-sm text-[#54595d] font-bold">인터랙티브 노드 맵 탐색하기</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Projects */}
        <div className="w-full lg:w-80 flex flex-col">
          <div className="border border-[#a2a9b1] bg-[#ffffff] rounded-sm">
            <h3 className="bg-[#eaecf0] border-b border-[#a2a9b1] p-2 font-bold text-sm flex items-center justify-between">
              <span>프로젝트 목록</span>
              <span className="text-[#54595d] font-normal text-[11px]">{projects.length}개</span>
            </h3>
            <div className="p-2">
              <ul className="space-y-2.5 text-[13px]">
                {projects.map((p) => (
                  <li key={p.id} className="border border-[#eaecf0] p-2.5 hover:bg-[#f8f9fa] transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/project/${p.id}`)}>
                    <div className="flex items-start">
                      <FolderOpen size={16} className="text-[#0645ad] mr-2 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#0645ad] hover:underline font-bold truncate">{p.name}</div>
                        <div className="text-[11px] text-[#54595d] mt-1 flex items-center space-x-3">
                          <span>문서 {p.doc_count}건</span>
                          <span>개체 {p.entity_count}건</span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {projects.length === 0 && (
                  <li className="text-[#54595d] italic text-center py-4">
                    아직 프로젝트가 없습니다.<br/>
                    <span className="text-[11px]">좌측 사이드바에서 「＋」버튼으로 생성하세요.</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
