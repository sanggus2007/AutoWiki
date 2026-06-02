"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Upload, Trash2, FileText, FolderOpen,
  Share2, ChevronRight, ChevronDown, Search, X, Pencil, Check, MessageSquare
} from "lucide-react";
import { assignTypeColors, TYPE_COLOR_NONE } from "@/lib/typeColor";
import { ProjectChatPanel } from "@/components/ProjectChatPanel";
import { ProjectFilesModal } from "@/components/ProjectFilesModal";
import { apiFetch } from "@/lib/api";


interface EntityItem {
  slug: string;
  name: string;
  type: string;
  categories: string[];
}

interface ProjectDetail {
  id: number;
  name: string;
  slug: string;
  description: string;
  entities: EntityItem[];
}


export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // default: all collapsed
  const [searchQuery, setSearchQuery] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/projects/${projectId}`)
      .then(async r => {
        if (!r.ok) throw new Error("failed to fetch project");
        return r.json();
      })
      .then((data: ProjectDetail) => {
        setProject(data);
        // Do NOT auto-expand — start all collapsed
      })
      .catch(err => console.error(err));
  }, [projectId]);

  const openEditModal = () => {
    if (!project) return;
    setEditName(project.name);
    setEditDesc(project.description || "");
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !project) return;
    setEditSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(prev => prev ? { ...prev, name: updated.name, description: updated.description } : prev);
        setShowEditModal(false);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const toggleGroup = (type: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleDeleteProject = async () => {
    const res = await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard");
  };

  const grouped = useMemo(() => {
    if (!project) return [];
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? (project.entities || []).filter(e =>
          e.name.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          e.categories.some(c => c.toLowerCase().includes(q))
        )
      : (project.entities || []);

    const map = new Map<string, EntityItem[]>();
    for (const e of filtered) {
      const key = e.type || "기타";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }

    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([type, items]) => ({
        type,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "ko")),
      }));
  }, [project, searchQuery]);

  // 황금각 기반 색상 배정 — grouped에 있는 모든 타입에 걹침 없는 색선 자동 배정
  const colorMap = useMemo(() => {
    const allTypes = grouped.map(g => g.type);
    return assignTypeColors(allTypes);
  }, [grouped]);

  const totalFiltered = grouped.reduce((s, g) => s + g.items.length, 0);

  if (!project) {
    return <div className="p-6 text-[#54595d] dark:text-gray-400 font-sans">프로젝트를 불러오는 중...</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl bg-white dark:bg-[#121212] min-h-screen text-[#202122] dark:text-[#eaecf0] font-sans transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <button onClick={() => router.push("/dashboard")} className="text-[#0645ad] dark:text-blue-400 hover:underline text-[13px] flex items-center self-start">
          <ArrowLeft size={14} className="mr-1" /> 대문으로 돌아가기
        </button>
        
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Main Actions - visible on all screens */}
          <button
            onClick={() => router.push(`/dashboard/project/${projectId}/upload`)}
            className="flex-1 sm:flex-none flex items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-sm font-bold text-[12px] sm:text-[13px] border border-[#0645ad] dark:border-blue-600 bg-[#0645ad] dark:bg-blue-600 text-white hover:bg-[#0b0080] dark:hover:bg-blue-700"
          >
            <Upload size={13} className="mr-1 sm:mr-1.5" /> 지식 추가
          </button>
          
          <button
            onClick={() => setIsChatOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-sm font-bold text-[12px] sm:text-[13px] border border-[#0645ad]/20 dark:border-blue-900/35 bg-[#eef1ff] dark:bg-blue-950/20 text-[#0645ad] dark:text-blue-400 hover:bg-[#d0daff] dark:hover:bg-blue-900/30 transition-colors"
          >
            <MessageSquare size={13} className="mr-1 sm:mr-1.5" /> AI 채팅
          </button>

          {/* Secondary Actions */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto mt-1 sm:mt-0">
            <button
              onClick={() => router.push(`/dashboard/graph?projectId=${projectId}`)}
              className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-3 py-1.5 rounded-sm font-bold text-[11px] sm:text-[12px] border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-gray-200 hover:bg-[#eaecf0] dark:hover:bg-zinc-700"
            >
              <Share2 size={12} className="mr-1 sm:mr-1.5" /> 구조도
            </button>
            <button
              onClick={() => setShowFilesModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-3 py-1.5 rounded-sm font-bold text-[11px] sm:text-[12px] border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-gray-200 hover:bg-[#eaecf0] dark:hover:bg-zinc-700"
            >
              <FolderOpen size={12} className="mr-1 sm:mr-1.5" /> 파일
            </button>
            <button
              onClick={openEditModal}
              className="flex items-center justify-center p-1.5 rounded-sm border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#54595d] dark:text-gray-400 hover:bg-[#eaecf0] dark:hover:bg-zinc-700"
              title="정보 수정"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-center p-1.5 rounded-sm border border-[#c8ccd1] dark:border-red-900/50 bg-[#fff3f3] dark:bg-red-950/20 text-[#cc0000] dark:text-red-400 hover:bg-[#fee7e6] dark:hover:bg-red-950/40"
              title="삭제"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="border-b border-[#a2a9b1] dark:border-zinc-800 mb-5 pb-2">
        <h1 className="text-2xl sm:text-3xl font-serif text-[#000000] dark:text-white mb-1 flex items-center min-w-0 break-words">
          <FolderOpen size={24} className="mr-2 text-[#54595d] dark:text-gray-400 shrink-0 lg:w-[28px] lg:h-[28px]" />
          {project.name}
        </h1>
        {project.description && (
          <p className="text-sm text-[#54595d] dark:text-gray-400 ml-8 sm:ml-9">{project.description}</p>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
        <div className="text-[13px] text-[#54595d] dark:text-gray-400">
          <span className="font-bold text-[#202122] dark:text-[#eaecf0]">{totalFiltered}</span>건
          {searchQuery && <span className="ml-1 text-[#0645ad] dark:text-blue-400">(검색 결과)</span>}
          {" · "}
          <span className="font-bold text-[#202122] dark:text-[#eaecf0]">{grouped.length}</span>개 분류
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (openGroups.size === grouped.length) {
                setOpenGroups(new Set());
              } else {
                setOpenGroups(new Set(grouped.map(g => g.type)));
              }
            }}
            className="text-[12px] text-[#0645ad] dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            {openGroups.size === grouped.length ? "모두 접기" : "모두 펼치기"}
          </button>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888] dark:text-gray-500" />
            <input
              type="text"
              placeholder="문서 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-[13px] border border-[#a2a9b1] dark:border-zinc-700 rounded-sm focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400 w-32 sm:w-48 bg-white dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] dark:text-gray-500 hover:text-[#cc0000] dark:hover:text-red-400">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grouped Entity List */}
      {project.entities.length === 0 ? (
        <div className="border border-[#a2a9b1] dark:border-zinc-800 rounded-sm p-8 text-center text-[#54595d] dark:text-gray-400 italic text-sm">
          이 프로젝트에는 아직 문서가 없습니다.<br />
          <button
            onClick={() => router.push(`/dashboard/project/${projectId}/upload`)}
            className="text-[#0645ad] dark:text-blue-400 hover:underline mt-2 inline-block"
          >
            파일을 업로드하여 위키를 생성하세요 →
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="border border-[#a2a9b1] dark:border-zinc-800 rounded-sm p-6 text-center text-[#54595d] dark:text-gray-400 text-sm">
          「{searchQuery}」에 일치하는 문서가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ type, items }) => {
            const isOpen = openGroups.has(type);
            return (
              <div key={type} className="border border-[#a2a9b1] dark:border-zinc-800 rounded-sm overflow-hidden">
                <button
                  onClick={() => toggleGroup(type)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-[#f8f9fa] dark:bg-zinc-900 hover:bg-[#eaecf0] dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0 mr-2">
                    {isOpen
                      ? <ChevronDown size={15} className="text-[#54595d] dark:text-gray-450 shrink-0" />
                      : <ChevronRight size={15} className="text-[#54595d] dark:text-gray-450 shrink-0" />
                    }
                    {/* colorMap 기반 인라인 스타일 배지 */}
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[12px] font-bold border whitespace-nowrap shrink-0"
                      style={(() => {
                        const c = colorMap.get(type) ?? TYPE_COLOR_NONE;
                        return {
                          backgroundColor: `${c}18`,
                          color: c,
                          borderColor: `${c}55`,
                        };
                      })()}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: colorMap.get(type) ?? TYPE_COLOR_NONE }}
                      />
                      {type}
                    </span>
                    {!isOpen && (
                      <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#202122] dark:text-[#eaecf0] min-w-0 max-w-[120px] min-[400px]:max-w-[200px] min-[500px]:max-w-[280px] sm:max-w-none">
                        <span className="truncate">
                          {items.slice(0, 2).map(e => e.name).join("、")}
                        </span>
                        {items.length > 2 && (
                          <span className="text-[#54595d] dark:text-gray-400 font-normal shrink-0">
                            외 {items.length - 2}건
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-[12px] text-[#54595d] dark:text-gray-400 font-mono shrink-0 ml-2">{items.length}건</span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-[#eaecf0] dark:divide-zinc-800">
                    {items.map((e) => (
                      <div
                        key={e.slug}
                        className="pl-8 pr-3 py-2.5 hover:bg-[#f8f9fa] dark:hover:bg-zinc-800 cursor-pointer transition-colors flex items-start"
                        onClick={() => router.push(`/dashboard/wiki/${e.slug}?projectId=${projectId}`)}
                      >
                        <FileText size={14} className="text-[#54595d] dark:text-gray-450 mr-2.5 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[#0645ad] dark:text-blue-400 hover:underline font-medium text-[14px]">{e.name}</span>
                          {e.categories.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {e.categories.map((c, i) => (
                                <span key={i} className="text-[11px] text-[#54595d] dark:text-gray-300 bg-[#f1f5f9] dark:bg-zinc-800 border border-[#e2e8f0] dark:border-zinc-700 px-1.5 py-0.5 rounded-sm">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit Modal ──────────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowEditModal(false)}>
          <div className="bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 shadow-lg p-6 max-w-md w-full my-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#000000] dark:text-white mb-4 font-serif flex items-center gap-2">
              <Pencil size={18} className="text-[#0645ad] dark:text-blue-400" /> 프로젝트 정보 수정
            </h3>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[12px] font-bold text-[#54595d] dark:text-gray-400 mb-1">프로젝트 이름 *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] px-3 py-1.5 text-[14px] focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400 rounded-sm"
                  placeholder="프로젝트 이름"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-[#54595d] dark:text-gray-400 mb-1">설명 (선택)</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full border border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] px-3 py-1.5 text-[14px] focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400 rounded-sm resize-none"
                  placeholder="프로젝트 설명"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-1.5 text-[13px] border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] hover:bg-[#eaecf0] dark:hover:bg-zinc-700 font-bold rounded-sm">취소</button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || editSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] border border-[#0645ad] dark:border-blue-600 bg-[#0645ad] dark:bg-blue-600 text-white hover:bg-[#0b0080] dark:hover:bg-blue-700 font-bold rounded-sm disabled:opacity-50"
              >
                <Check size={14} /> {editSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ────────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 shadow-lg p-6 max-w-md w-full my-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#000000] dark:text-white mb-2 font-serif">프로젝트 삭제 확인</h3>
            <p className="text-[14px] text-[#202122] dark:text-[#eaecf0] mb-1">
              <strong>「{project.name}」</strong> 프로젝트를 정말 삭제하시겠습니까?
            </p>
            <p className="text-[12px] text-[#54595d] dark:text-gray-400 mb-5">
              이 프로젝트에 포함된 모든 문서, 개체, 관계 데이터가 영구적으로 삭제됩니다.
            </p>
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 text-[13px] border border-[#a2a9b1] dark:border-zinc-700 bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] hover:bg-[#eaecf0] dark:hover:bg-zinc-700 font-bold">취소</button>
              <button onClick={handleDeleteProject} className="px-4 py-1.5 text-[13px] border border-[#cc0000] dark:border-red-650 bg-[#cc0000] dark:bg-red-650 text-white hover:bg-[#aa0000] dark:hover:bg-red-750 font-bold">삭제 실행</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat Panel ────────────────────────────────────────────────── */}
      {isChatOpen && (
        <ProjectChatPanel projectId={projectId} onClose={() => setIsChatOpen(false)} />
      )}

      {/* ── Files Modal ────────────────────────────────────────────────── */}
      {showFilesModal && (
        <ProjectFilesModal projectId={projectId} onClose={() => setShowFilesModal(false)} />
      )}
    </div>
  );
}
