"use client";

import React, { useEffect, useState } from "react";
import { Home, Book, FileText, Settings, Search, Edit3, FolderOpen, Plus, Network, Archive, LogOut, Database, Menu, X as CloseIcon } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import ExportImportPanel from "./ExportImportPanel";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/store";


interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<{id: number, name: string, slug: string}[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const { user, logout } = useAuthStore();
  const [storageUsed, setStorageUsed] = useState(0);
  const storageLimit = 10485760; // 10MB
  const [showExportImport, setShowExportImport] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/me")
      .then(res => res.json())
      .then(data => setStorageUsed(data.storage_used || 0))
      .catch(() => {});
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  useEffect(() => {
    apiFetch("/api/projects")
      .then(async r => {
        if (!r.ok) throw new Error("failed to fetch projects");
        return r.json();
      })
      .then(data => {
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error(err);
        setProjects([]); // Fallback to empty array on error
      });
  }, [pathname]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const formData = new FormData();
    formData.append("name", newProjectName.trim());
    formData.append("description", newProjectDesc.trim());
    
    const res = await apiFetch("/api/projects", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      setProjects(prev => [data, ...prev]);
      setNewProjectName("");
      setNewProjectDesc("");
      setShowCreateModal(false);
      router.push(`/dashboard/project/${data.id}`);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[60] lg:hidden" 
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-[70] w-64 bg-[#f6f6f6] border-r border-[#a2a9b1] flex flex-col transition-transform duration-300 transform
        lg:relative lg:translate-x-0 lg:w-56 lg:z-auto
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        shrink-0 font-sans text-sm
      `}>
        {/* Mobile Header in Sidebar */}
        <div className="lg:hidden flex justify-end p-2 border-b border-[#a2a9b1]">
          <button onClick={onClose} className="p-2 text-[#54595d]">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="p-5 pb-3">
          <div className="flex flex-col items-center justify-center cursor-pointer mb-2" onClick={() => router.push("/dashboard")}>
            <Book size={40} className="text-[#000000] mb-1" strokeWidth={1} />
            <span className="text-lg font-serif font-medium text-[#000000] tracking-tight">
              AutoWiki AI
            </span>
            <span className="text-[9px] text-[#54595d] mt-0.5 tracking-wider uppercase">자동 생성 백과사전</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-[11px] font-bold text-[#54595d] px-2 mb-1 uppercase tracking-wider">탐색</div>
          <NavItem icon={<Home size={15} />} label="대문" href="/dashboard" active={pathname === "/dashboard"} />
          <NavItem icon={<Network size={15} />} label="전체 지식 구조도" href="/dashboard/graph" active={pathname === "/dashboard/graph"} />
          
          <div className="mt-5 mb-1">
            <div className="flex items-center justify-between px-2">
              <div className="text-[11px] font-bold text-[#54595d] uppercase tracking-wider">프로젝트</div>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="text-[#0645ad] hover:text-[#0b0080] p-0.5"
                title="새 프로젝트 만들기"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          {projects.map(p => (
            <NavItem 
              key={p.id} 
              icon={<FolderOpen size={15} />} 
              label={p.name} 
              href={`/dashboard/project/${p.id}`} 
              active={pathname === `/dashboard/project/${p.id}` || pathname.startsWith(`/dashboard/project/${p.id}/`)} 
            />
          ))}
          {projects.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-[#54595d] italic">아직 프로젝트가 없습니다.</div>
          )}
        </nav>

        <div className="p-3 border-t border-[#a2a9b1] pb-[calc(12px+env(safe-area-inset-bottom))]">
          {/* Storage Details */}
          <div className="mt-3 px-2 mb-3">
             <div className="flex items-center justify-between mb-1">
                 <div className="text-[11px] font-bold text-[#54595d] uppercase tracking-wider flex items-center">
                    <Database size={11} className="mr-1" />
                    저장소 용량 제한
                 </div>
                 <div className="text-[10px] text-[#54595d]">
                    {(storageUsed / 1024).toFixed(1)} / 10240 KB
                 </div>
             </div>
             <div className="w-full bg-[#eaecf0] h-1.5 rounded-full overflow-hidden">
                 <div 
                    className={`h-full ${storageUsed >= storageLimit ? 'bg-red-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${Math.min(100, (storageUsed / storageLimit) * 100)}%` }}
                 />
             </div>
          </div>

          <div className="text-[11px] font-bold text-[#54595d] px-2 mt-4 mb-2 uppercase tracking-wider">도구 모음</div>
          <NavItem icon={<Settings size={15} />} label="환경 설정" href="/dashboard/settings" active={pathname === "/dashboard/settings"} />
          <div
            onClick={() => setShowExportImport(true)}
            className="flex items-center space-x-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-[13px] text-[#0645ad] hover:bg-[#eaecf0] hover:underline mb-2"
          >
            <span className="shrink-0 text-[#0645ad]"><Archive size={15} /></span>
            <span className="truncate">내보내기 / 가져오기</span>
          </div>

          <div className="text-[11px] font-bold text-[#54595d] px-2 mb-2 uppercase tracking-wider">계정 관리</div>
          {user && (
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex items-center space-x-2 truncate">
                {user.avatar_url ? (
                   <img src={user.avatar_url} alt="Profile" className="w-6 h-6 rounded-full border border-[#a2a9b1]" />
                ) : (
                   <div className="w-6 h-6 rounded-full bg-[#eaecf0] border border-[#a2a9b1] flex items-center justify-center text-[10px] font-bold text-[#54595d]">
                     {user.username.charAt(0).toUpperCase()}
                   </div>
                )}
                <span className="text-[12px] font-semibold text-[#202122] truncate">{user.username}</span>
              </div>
            </div>
          )}
          <div
            onClick={handleLogout}
            className="flex items-center space-x-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-[13px] text-red-600 hover:bg-[#eaecf0] hover:underline"
          >
            <span className="shrink-0 text-red-600"><LogOut size={15} /></span>
            <span className="truncate">로그아웃</span>
          </div>
        </div>
      </aside>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white border border-[#a2a9b1] shadow-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#000000] mb-4 font-serif">새 프로젝트 만들기</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-bold mb-1">프로젝트 이름 *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="예: Q2 마케팅 전략"
                  className="w-full border border-[#a2a9b1] px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[13px] font-bold mb-1">설명 (선택)</label>
                <textarea
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  placeholder="이 프로젝트에 대한 간략한 설명"
                  className="w-full border border-[#a2a9b1] px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad] resize-none h-20"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-5">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-1.5 text-[13px] border border-[#a2a9b1] bg-[#f8f9fa] text-[#202122] hover:bg-[#eaecf0] font-bold"
              >
                취소
              </button>
              <button 
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="px-4 py-1.5 text-[13px] border border-[#0645ad] bg-[#0645ad] text-white hover:bg-[#0b0080] font-bold disabled:opacity-40"
              >
                프로젝트 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export / Import Modal */}
      {showExportImport && (
        <ExportImportPanel onClose={() => setShowExportImport(false)} />
      )}
    </>
  );
};

const NavItem = ({ icon, label, active = false, href }: { icon: React.ReactNode; label: string; active?: boolean; href?: string }) => {
  const router = useRouter();
  return (
    <div
      onClick={() => href && router.push(href)}
      className={`flex items-center space-x-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-[13px] ${
        active
          ? "bg-[#eaecf0] text-[#000000] font-bold"
          : "text-[#0645ad] hover:bg-[#eaecf0] hover:underline"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-[#000000]" : "text-[#0645ad]"}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
};

export const Header = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{type: "project" | "entity", name: string, url: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleDummyClick = (menu: string) => {
    const messages: Record<string, string> = {
      "토론": "저희 사용자들의 수준이 너무 높아서 토론이 필요 없는 경지에 이르렀습니다... (실은 개발 중이에요! 🤫)",
      "기여": "여러분의 소중한 기여를 담기엔 서버가 아직 너무 작습니다. 무럭무럭 키워올게요! 🌱",
      "최근 바뀜": "방금 전 당신이 이 버튼을 누른 게 가장 최근의 변화입니다! (농담이에요, 곧 추가됩니다! 🚀)"
    };
    alert(messages[menu] || "곧 구현될 기능입니다!");
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        setIsSearching(true);
        try {
          const res = await apiFetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data);
            setShowResults(true);
          }
        } catch (err) {
          console.error("Search failed", err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <header className="h-[calc(3.5rem+env(safe-area-inset-top))] bg-[#ffffff] border-b border-[#a2a9b1] flex items-center justify-between px-4 shrink-0 font-sans z-40 relative pt-[env(safe-area-inset-top)]">
      <div className="flex items-center space-x-2 lg:space-x-6 text-[#0645ad] text-sm">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-1 -ml-1 text-[#54595d] hover:bg-[#eaecf0] rounded-sm"
        >
          <Menu size={20} />
        </button>
        <span onClick={() => handleDummyClick("토론")} className="hidden sm:inline hover:underline cursor-pointer">토론</span>
        <span onClick={() => handleDummyClick("기여")} className="hidden sm:inline hover:underline cursor-pointer">기여</span>
        <span onClick={() => handleDummyClick("최근 바뀜")} className="hidden md:inline hover:underline cursor-pointer">최근 바뀜</span>
      </div>

      <div className="flex-1 max-w-[200px] sm:max-w-sm ml-auto relative">
        <div className="relative group flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setShowResults(true)}
            placeholder="AutoWiki AI 검색"
            className="w-full bg-[#ffffff] text-[#000000] border border-[#a2a9b1] pl-3 pr-8 py-1 text-sm focus:outline-none focus:border-[#0645ad] transition-all"
          />
          <Search className={`absolute right-2 ${isSearching ? 'animate-pulse text-[#0645ad]' : 'text-[#54595d]'}`} size={16} />
        </div>

        {/* Search Results Dropdown */}
        {showResults && (
          <div className="absolute top-full right-0 w-full mt-1 bg-white border border-[#a2a9b1] shadow-xl rounded-sm overflow-hidden z-[100] max-h-80 overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="py-1">
                {searchResults.map((result, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      router.push(result.url);
                      setSearchQuery("");
                      setShowResults(false);
                    }}
                    className="px-4 py-2 hover:bg-[#eaecf0] cursor-pointer flex items-center gap-2 border-b border-[#f0f0f0] last:border-0"
                  >
                    {result.type === "project" ? (
                      <FolderOpen size={14} className="text-[#0645ad]" />
                    ) : (
                      <FileText size={14} className="text-[#54595d]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-[#202122] truncate">{result.name}</div>
                      <div className="text-[10px] text-[#54595d] uppercase tracking-tighter">{result.type === "project" ? "프로젝트" : "위키 문서"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#54595d] italic">
                검색 결과가 없습니다.
              </div>
            )}
            <div 
              className="p-1 px-4 text-right bg-[#f8f9fa] border-t border-[#f0f0f0]"
              onClick={() => setShowResults(false)}
            >
              <span className="text-[10px] text-[#0645ad] cursor-pointer hover:underline font-bold">닫기</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Click outside to close results */}
      {showResults && (
        <div className="fixed inset-0 z-[90]" onClick={() => setShowResults(false)} />
      )}
    </header>
  );
};
