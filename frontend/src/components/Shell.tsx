"use client";

import React, { useEffect, useState } from "react";
import { Home, Book, FileText, Settings, Search, Edit3, FolderOpen, Plus, Archive, LogOut, Database, Menu, Sparkles, X as CloseIcon, Loader2 } from "lucide-react";
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
  const [projects, setProjects] = useState<{ id: number, name: string, slug: string }[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const { user, logout, tokens, setTokens, activeProcess } = useAuthStore();
  const [storageUsed, setStorageUsed] = useState(0);
  const [resetClicks, setResetClicks] = useState(0);
  const storageLimit = 10485760; // 10MB
  const [showExportImport, setShowExportImport] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/me")
      .then(res => res.json())
      .then(data => {
        setStorageUsed(data.storage_used || 0);
        setTokens(data.tokens ?? 100);
      })
      .catch(() => { });
  }, [pathname]);

  useEffect(() => {
    // Reset click count when pathname changes
    setResetClicks(0);
  }, [pathname]);

  const handleHomeClick = async () => {
    const nextClicks = resetClicks + 1;
    if (nextClicks >= 10) {
      try {
        const res = await apiFetch("/api/users/me/reset-tokens", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setTokens(data.tokens);
          alert("🔑 이스터에그 발견! AI 토큰이 100개로 리셋되었습니다.");
        }
      } catch (err) {
        console.error("Failed to reset tokens:", err);
      }
      setResetClicks(0);
    } else {
      setResetClicks(nextClicks);
      router.push("/dashboard");
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout failed:", err);
    }
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
        fixed inset-y-0 left-0 z-[70] w-64 max-w-[85vw] bg-[#f6f6f6] dark:bg-black border-r border-[#a2a9b1] dark:border-gray-700 flex flex-col transition-transform duration-300 transform
        lg:sticky lg:top-0 lg:h-[100dvh] lg:translate-x-0 lg:w-56 lg:z-auto lg:max-w-none
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        shrink-0 font-sans text-sm
      `}>
        {/* Mobile Header in Sidebar */}
        <div className="lg:hidden flex items-center justify-between p-3 border-b border-[#a2a9b1] dark:border-gray-700 bg-white dark:bg-black shrink-0">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => { router.push("/dashboard"); onClose?.(); }}>
            <Book size={18} className="text-[#000000] dark:text-white" strokeWidth={1.5} />
            <span className="text-sm font-serif font-bold text-[#000000] dark:text-white tracking-tight">AutoWiki AI</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#54595d] dark:text-gray-400 hover:bg-[#eaecf0] dark:hover:bg-gray-800 rounded-sm">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="hidden lg:block p-5 pb-3 shrink-0">
          <div className="flex flex-col items-center justify-center cursor-pointer mb-2" onClick={() => router.push("/dashboard")}>
            <Book size={40} className="text-[#000000] dark:text-white mb-1" strokeWidth={1} />
            <span className="text-lg font-serif font-medium text-[#000000] dark:text-white tracking-tight">
              AutoWiki AI
            </span>
            <span className="text-[9px] text-[#54595d] mt-0.5 tracking-wider uppercase">자동 생성 백과사전</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-[11px] font-bold text-[#54595d] dark:text-gray-400 px-2 mb-1 uppercase tracking-wider">탐색</div>
          <NavItem
            icon={<Home size={15} />}
            label="대문"
            active={pathname === "/dashboard"}
            onClick={handleHomeClick}
          />

          <div className="mt-5 mb-1">
            <div className="flex items-center justify-between px-2">
              <div className="text-[11px] font-bold text-[#54595d] dark:text-gray-400 uppercase tracking-wider">프로젝트</div>
              <button
                onClick={() => {
                  setResetClicks(0);
                  setShowCreateModal(true);
                }}
                className="text-[#0645ad] dark:text-blue-400 hover:text-[#0b0080] dark:hover:text-blue-300 p-0.5"
                title="새 프로젝트 만들기"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          {projects.map(p => {
            const isActiveProj = activeProcess && activeProcess.projectId === String(p.id);
            let redirectUrl = `/dashboard/project/${p.id}`;
            let statusBadge = null;
            let iconElement = <FolderOpen size={15} />;

            if (isActiveProj) {
              redirectUrl = `/dashboard/project/${p.id}/upload`;
              if (activeProcess.status === "RUNNING") {
                if (activeProcess.type === "INGEST") {
                  iconElement = <Loader2 size={15} className="animate-spin text-blue-500" />;
                  statusBadge = (
                    <span className="ml-auto text-[9px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 px-1.5 py-0.5 rounded-full animate-pulse">
                      기획 중
                    </span>
                  );
                } else {
                  iconElement = <Loader2 size={15} className="animate-spin text-purple-500" />;
                  statusBadge = (
                    <span className="ml-auto text-[9px] text-purple-600 dark:text-purple-400 font-bold bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50 px-1.5 py-0.5 rounded-full animate-pulse">
                      작성 중
                    </span>
                  );
                }
              } else if (activeProcess.status === "SUCCESS" && activeProcess.type === "INGEST") {
                iconElement = <Sparkles size={15} className="text-emerald-500 animate-bounce" />;
                statusBadge = (
                  <span className="ml-auto text-[9px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 px-1.5 py-0.5 rounded-full">
                    기획 완료
                  </span>
                );
              }
            }

            return (
              <NavItem
                key={p.id}
                icon={iconElement}
                label={p.name}
                href={redirectUrl}
                active={pathname === `/dashboard/project/${p.id}` || pathname.startsWith(`/dashboard/project/${p.id}/`)}
                suffix={statusBadge}
              />
            );
          })}
          {projects.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-gray-500 italic">아직 프로젝트가 없습니다.</div>
          )}
        </nav>

        <div className="p-2 lg:p-3 border-t border-gray-700 pb-[calc(8px+env(safe-area-inset-bottom))] lg:pb-3 shrink-0">
          {/* Storage Details */}
          <div className="mt-1 lg:mt-3 px-2 mb-1 lg:mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] lg:text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                <Database size={10} className="mr-1 w-2.5 h-2.5 lg:w-3 lg:h-3" />
                저장소 용량 제한
              </div>
              <div className="text-[9px] lg:text-[10px] font-semibold text-[#54595d] dark:text-gray-400">
                {(storageUsed / 1024).toFixed(1)} / 10240 KB
              </div>
            </div>
            <div className="w-full bg-[#eaecf0] dark:bg-zinc-800 h-1 lg:h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${storageUsed >= storageLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, (storageUsed / storageLimit) * 100)}%` }}
              />
            </div>
          </div>

          {/* AI Token Details */}
          <div className="mt-2 lg:mt-3 px-2 mb-1 lg:mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] lg:text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                <Sparkles size={10} className="mr-1 w-2.5 h-2.5 lg:w-3 lg:h-3" />
                AI 토큰 잔여량
              </div>
              <div className="text-[9px] lg:text-[10px] font-semibold text-[#54595d] dark:text-gray-400">
                {tokens} / 100 토큰
              </div>
            </div>
            <div className="w-full bg-[#eaecf0] dark:bg-zinc-800 h-1 lg:h-1.5 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-purple-600 dark:bg-purple-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (tokens / 100) * 100)}%` }}
              />
            </div>
            <div className="text-[9px] text-gray-600 dark:text-gray-400 text-right">
              매일 자정 초기화
            </div>
          </div>

          <div className="text-[10px] lg:text-[11px] font-bold text-[#54595d] dark:text-gray-400 px-2 mt-2 mb-1 lg:mt-4 lg:mb-2 uppercase tracking-wider">도구 모음</div>
          <NavItem
            icon={<Settings size={14} />}
            label="환경 설정"
            href="/dashboard/settings"
            active={pathname === "/dashboard/settings"}
          />
          <div
            onClick={() => {
              setResetClicks(0);
              setShowExportImport(true);
            }}
            className="flex items-center space-x-2 px-2 py-1 lg:py-1.5 rounded-sm cursor-pointer transition-colors text-[12px] lg:text-[13px] text-[#202122] dark:text-zinc-300 hover:bg-[#eaecf0] dark:hover:bg-zinc-800 mb-1 lg:mb-2"
          >
            <span className="shrink-0 text-[#54595d] dark:text-zinc-400 w-3.5 h-3.5 lg:w-[15px] lg:h-[15px] flex items-center justify-center"><Archive size={14} className="w-full h-full" /></span>
            <span className="truncate">내보내기 / 가져오기</span>
          </div>

          <div className="text-[10px] lg:text-[11px] font-bold text-[#54595d] dark:text-gray-400 px-2 mb-1 lg:mb-2 uppercase tracking-wider">계정 관리</div>
          {user && (
            <div className="flex items-center justify-between px-2 mb-1 lg:mb-2 min-w-0">
              <div className="flex items-center space-x-2 truncate min-w-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="Profile" className="w-5 h-5 lg:w-6 lg:h-6 rounded-full border border-[#a2a9b1] dark:border-zinc-700" />
                ) : (
                  <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-[#eaecf0] dark:bg-zinc-800 border border-[#a2a9b1] dark:border-zinc-700 flex items-center justify-center text-[9px] lg:text-[10px] font-bold text-[#54595d] dark:text-gray-300 shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] lg:text-[12px] font-semibold text-[#202122] dark:text-[#eaecf0] truncate min-w-0">{user.username}</span>
              </div>
            </div>
          )}
          <div
            onClick={() => {
              setResetClicks(0);
              handleLogout();
            }}
            className="flex items-center space-x-2 px-2 py-1 lg:py-1.5 rounded-sm cursor-pointer transition-colors text-[12px] lg:text-[13px] text-red-600 dark:text-red-400 hover:bg-[#eaecf0] dark:hover:bg-zinc-800"
          >
            <span className="shrink-0 text-red-600 dark:text-red-400 w-3.5 h-3.5 lg:w-[15px] lg:h-[15px] flex items-center justify-center"><LogOut size={14} className="w-full h-full" /></span>
            <span className="truncate">로그아웃</span>
          </div>
        </div>
      </aside>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 shadow-lg p-6 max-w-md w-full my-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#000000] dark:text-white mb-4 font-serif">새 프로젝트 만들기</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-bold mb-1 dark:text-gray-300">프로젝트 이름 *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="예: Q2 마케팅 전략"
                  className="w-full border border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[13px] font-bold mb-1 dark:text-gray-300">설명 (선택)</label>
                <textarea
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  placeholder="이 프로젝트에 대한 간략한 설명"
                  className="w-full border border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400 resize-none h-20"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-1.5 text-[13px] border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] hover:bg-[#eaecf0] dark:hover:bg-zinc-700 font-bold"
              >
                취소
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="px-4 py-1.5 text-[13px] border border-[#0645ad] dark:border-blue-600 bg-[#0645ad] dark:bg-blue-600 text-white hover:bg-[#0b0080] dark:hover:bg-blue-700 font-bold disabled:opacity-40 disabled:bg-slate-300 dark:disabled:bg-zinc-800"
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

const NavItem = ({ icon, label, active = false, href, onClick, suffix }: { icon: React.ReactNode; label: string; active?: boolean; href?: string; onClick?: () => void; suffix?: React.ReactNode }) => {
  const router = useRouter();
  return (
    <div
      onClick={() => {
        if (onClick) onClick();
        else if (href) router.push(href);
      }}
      className={`flex items-center space-x-2 px-2 py-1 lg:py-1.5 rounded-sm cursor-pointer transition-colors text-[12px] lg:text-[13px] min-w-0 ${active
          ? "bg-[#eaecf0] dark:bg-zinc-800 text-[#000000] dark:text-white font-bold"
          : "text-[#202122] dark:text-zinc-300 hover:bg-[#eaecf0] dark:hover:bg-zinc-800"
        }`}
    >
      <span className={`shrink-0 ${active ? "text-[#000000] dark:text-white" : "text-[#54595d] dark:text-zinc-400"} w-3.5 h-3.5 lg:w-[15px] lg:h-[15px] flex items-center justify-center`}>{icon}</span>
      <span className="truncate min-w-0 flex-1">{label}</span>
      {suffix}
    </div>
  );
};

export const Header = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ type: "project" | "entity", name: string, url: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

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
    <header className="h-[calc(3.5rem+env(safe-area-inset-top))] bg-[#ffffff] dark:bg-black border-b border-[#a2a9b1] dark:border-gray-700 flex items-center justify-between px-4 shrink-0 font-sans z-40 relative pt-[env(safe-area-inset-top)]">
      <div className="flex items-center space-x-2 lg:space-x-6 text-[#0645ad] dark:text-blue-400 text-sm">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1 -ml-1 text-[#54595d] dark:text-gray-400 hover:bg-[#eaecf0] dark:hover:bg-gray-800 rounded-sm"
        >
          <Menu size={20} />
        </button>
      </div>

      <div className="flex-1 max-w-[200px] sm:max-w-sm ml-auto relative">
        <div className="relative group flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setShowResults(true)}
            placeholder="AutoWiki AI 검색"
            className="w-full bg-[#ffffff] dark:bg-zinc-900 text-[#000000] dark:text-white border border-[#a2a9b1] dark:border-gray-700 pl-3 pr-8 py-1.5 text-[16px] sm:text-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-500 transition-all"
          />
          <Search className={`absolute right-2 ${isSearching ? 'animate-pulse text-[#0645ad] dark:text-blue-400' : 'text-[#54595d] dark:text-gray-400'}`} size={16} />
        </div>

        {/* Search Results Dropdown */}
        {showResults && (
          <div className="absolute top-full right-0 w-full mt-1 bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 shadow-xl rounded-sm overflow-hidden z-[100] max-h-80 overflow-y-auto">
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
                    className="px-4 py-2 hover:bg-[#eaecf0] dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-2 border-b border-[#f0f0f0] dark:border-zinc-800 last:border-0"
                  >
                    {result.type === "project" ? (
                      <FolderOpen size={14} className="text-[#0645ad] dark:text-blue-400" />
                    ) : (
                      <FileText size={14} className="text-[#54595d] dark:text-gray-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-[#202122] dark:text-[#eaecf0] truncate">{result.name}</div>
                      <div className="text-[10px] text-[#54595d] dark:text-gray-400 uppercase tracking-tighter">{result.type === "project" ? "프로젝트" : "위키 문서"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#54595d] dark:text-gray-400 italic">
                검색 결과가 없습니다.
              </div>
            )}
            <div
              className="p-1 px-4 text-right bg-[#f8f9fa] dark:bg-zinc-900 border-t border-[#f0f0f0] dark:border-zinc-800"
              onClick={() => setShowResults(false)}
            >
              <span className="text-[10px] text-[#0645ad] dark:text-blue-400 cursor-pointer hover:underline font-bold">닫기</span>
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
