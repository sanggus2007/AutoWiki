"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { KnowledgeGraph, GraphSettings, DEFAULT_SETTINGS } from "@/components/KnowledgeGraph";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import {
  ChevronDown, Edit3, X, Check, Trash2, Link as LinkIcon,
  PlusCircle, AlertTriangle, Settings2, RotateCcw,
} from "lucide-react";


const ENTITY_TYPES = ["개념", "기술", "인물", "프로젝트", "조직", "이론", "방법론", "기타"];

interface ProjectItem { id: number; name: string; slug: string; }

// ─── Settings Sub-components ──────────────────────────────────────────────────

const ToggleBtn = ({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`flex-1 text-xs py-2 rounded-md border transition-all leading-none ${
      active
        ? 'bg-purple-50 dark:bg-[#a855f7]/20 border-purple-250 dark:border-[#a855f7]/55 text-purple-700 dark:text-[#c084fc]'
        : 'bg-slate-50 dark:bg-[#151515] border-slate-200 dark:border-[#2a2a2a] text-slate-500 dark:text-[#666] hover:border-slate-300 dark:hover:border-[#444] hover:text-slate-700 dark:hover:text-[#999]'
    }`}
  >
    {children}
  </button>
);

const Slider = ({
  label, value, min, max, step, unit = '', onChange: onCh,
}: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) => {
  const [localVal, setLocalVal] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(String(value));
  
  // 외부 프로퍼티가 바뀌면 동기화 (초기화 버튼 등 대응)
  useEffect(() => {
    setLocalVal(value);
    setTempVal(String(value));
  }, [value]);

  const handleManualCommit = () => {
    let numerical = Number(tempVal);
    if (isNaN(numerical)) numerical = value;
    numerical = Math.max(min, Math.min(max, numerical));
    setLocalVal(numerical);
    setTempVal(String(numerical));
    setIsEditing(false);
    onCh(numerical);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5 min-h-[16px]">
        <span className="text-[11px] text-slate-500 dark:text-[#666]">{label}</span>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={tempVal}
              onChange={e => setTempVal(e.target.value)}
              onBlur={handleManualCommit}
              onKeyDown={e => e.key === 'Enter' && handleManualCommit()}
              autoFocus
              className="w-12 bg-slate-100 dark:bg-[#1a1a1a] border border-purple-200 dark:border-[#a855f7]/50 text-purple-600 dark:text-[#a855f7] text-[10px] px-1 text-right rounded focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 dark:text-[#555]">{unit}</span>
          </div>
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            className="text-[11px] text-slate-500 dark:text-[#888] tabular-nums cursor-text hover:text-purple-600 dark:hover:text-[#a855f7] transition-colors"
          >
            {localVal}{unit}
          </span>
        )}
      </div>
      <input
        type="range" min={min} max={max} step={step} value={localVal}
        onChange={e => {
          const v = Number(e.target.value);
          setLocalVal(v);
          setTempVal(String(v));
          onCh(v);
        }}
        className="w-full h-1 rounded-full cursor-pointer accent-[#a855f7]"
        style={{ background: `linear-gradient(to right, #a855f7 ${((localVal - min) / (max - min)) * 100}%, var(--slider-track, #2a2a2a) ${((localVal - min) / (max - min)) * 100}%)` }}
      />
    </div>
  );
};

const Toggle = ({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) => (
  <label className="flex items-center justify-between cursor-pointer select-none">
    <span className="text-xs text-slate-500 dark:text-[#999]">{label}</span>
    <div
      onClick={onToggle}
      className={`w-9 h-[18px] rounded-full border transition-all relative flex-shrink-0 ${
        value ? 'bg-purple-400/50 dark:bg-[#a855f7]/50 border-purple-500/60 dark:border-[#a855f7]/60' : 'bg-slate-100 dark:bg-[#1a1a1a] border-slate-250 dark:border-[#333]'
      }`}
    >
      <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
        value ? 'translate-x-[18px]' : 'translate-x-0.5'
      }`} />
    </div>
  </label>
);

// ─── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: GraphSettings;
  onChange: (s: GraphSettings) => void;
  onClose: () => void;
}) {
  const set = (partial: Partial<GraphSettings>) => onChange({ ...settings, ...partial });

  const themes = [
    { id: 'dark', label: '다크', swatch: '#0a0a0a' },
    { id: 'cosmos', label: '코스모스', swatch: '#03030e' },
    { id: 'neon', label: '네온', swatch: '#060009' },
    { id: 'forest', label: '포레스트', swatch: '#020906' },
  ] as const;

  return (
    <div className="fixed inset-y-0 right-0 w-[85%] max-w-[300px] md:relative md:w-72 h-full flex flex-col bg-white dark:bg-[#0e0e0e] border-l border-slate-200 dark:border-[#222] z-50 shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#1e1e1e] flex-shrink-0">
        <span className="text-slate-700 dark:text-[#ccc] text-sm font-semibold flex items-center gap-2">
          <Settings2 size={13} className="text-[#a855f7]" /> 그래프 설정
        </span>
        <button onClick={onClose} className="text-slate-400 dark:text-[#555] hover:text-slate-600 dark:hover:text-[#aaa] transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 scrollbar-thin">

        {/* Dimension */}
        <section>
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest mb-3 font-bold">차원 (Dimension)</div>
          <div className="flex gap-2">
            <ToggleBtn active={settings.dimension === '2d'} onClick={() => set({ dimension: '2d' })}>
              2D (평면)
            </ToggleBtn>
            <ToggleBtn active={settings.dimension === '3d'} onClick={() => set({ dimension: '3d' })}>
              3D (공간)
            </ToggleBtn>
          </div>
        </section>

        {/* Layout */}
        <section>
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest mb-3 font-bold">레이아웃</div>
          <div className="flex gap-2">
            <ToggleBtn active={settings.layout === 'radial'} onClick={() => set({ layout: 'radial' })}>
              🌐 방사형 마인드맵
            </ToggleBtn>
            <ToggleBtn active={settings.layout === 'force'} onClick={() => set({ layout: 'force' })}>
              ⚡ 자유 배치
            </ToggleBtn>
          </div>
        </section>

        {/* Node Size */}
        <section>
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest mb-3 font-bold">노드 크기</div>
          <div className="flex gap-2">
            <ToggleBtn active={settings.nodeSizeMode === 'dynamic'} onClick={() => set({ nodeSizeMode: 'dynamic' })}>
              연결 수 비례
            </ToggleBtn>
            <ToggleBtn active={settings.nodeSizeMode === 'uniform'} onClick={() => set({ nodeSizeMode: 'uniform' })}>
              균일
            </ToggleBtn>
          </div>
        </section>

        {/* Label */}
        <section>
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest mb-3 font-bold">레이블 표시</div>
          <div className="flex gap-1.5">
            {(['always', 'hover', 'hidden'] as const).map(m => (
              <ToggleBtn key={m} active={settings.labelMode === m} onClick={() => set({ labelMode: m })}>
                {{ always: '항상', hover: '호버', hidden: '숨김' }[m]}
              </ToggleBtn>
            ))}
          </div>
        </section>

        {/* Theme */}
        <section>
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest mb-3 font-bold">배경 테마</div>
          <div className="grid grid-cols-2 gap-2">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => set({ theme: t.id })}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-xs transition-all ${
                  settings.theme === t.id
                    ? 'border-purple-350 dark:border-[#a855f7]/55 text-purple-900 dark:text-white bg-purple-50 dark:bg-[#a855f7]/10'
                    : 'border-slate-200 dark:border-[#2a2a2a] text-slate-500 dark:text-[#666] hover:border-slate-350 dark:hover:border-[#444] hover:text-slate-700 dark:hover:text-[#999]'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-slate-300 dark:border-[#444]"
                  style={{ background: t.swatch }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* Sliders */}
        <section className="space-y-4">
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest font-bold">물리 설정</div>
          <Slider
            label="반발력 (Charge)"
            value={settings.chargeStrength}
            min={-1200} max={-50} step={25}
            onChange={v => set({ chargeStrength: v })}
          />
          <Slider
            label="링크 거리"
            value={settings.linkDistance}
            min={30} max={600} step={10} unit="px"
            onChange={v => set({ linkDistance: v })}
          />
          {settings.layout === 'radial' && (
            <Slider
              label="링 간격 (방사형)"
              value={settings.ringSpacing}
              min={60} max={600} step={10} unit="px"
              onChange={v => set({ ringSpacing: v })}
            />
          )}
        </section>

        {/* Toggles */}
        <section className="space-y-3">
          <div className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest font-bold">표시 옵션</div>
          <Toggle
            label="파티클 효과"
            value={settings.showParticles}
            onToggle={() => set({ showParticles: !settings.showParticles })}
          />
          <Toggle
            label="링크 레이블"
            value={settings.showLinkLabels}
            onToggle={() => set({ showLinkLabels: !settings.showLinkLabels })}
          />
        </section>

        {/* Reset */}
        <button
          onClick={() => onChange(DEFAULT_SETTINGS)}
          className="w-full flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-[#555] hover:text-slate-750 dark:hover:text-[#888] py-2.5 border border-slate-250 dark:border-[#222] hover:border-slate-350 dark:hover:border-[#333] rounded-md transition-all"
        >
          <RotateCcw size={11} /> 기본값으로 초기화
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function GraphPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // Panels
  const [isEditMode, setIsEditMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);

  // Node edit
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedLink, setSelectedLink] = useState<any>(null);
  const [editPanel, setEditPanel] = useState<'node' | 'link' | 'link-connect' | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [nodeIsRoot, setNodeIsRoot] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [connectingFrom, setConnectingFrom] = useState<any>(null);
  const [connectTarget, setConnectTarget] = useState<any>(null);
  const [connectLabel, setConnectLabel] = useState('');
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<'node' | 'link' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refreshGraph = () => window.dispatchEvent(new Event('graph:refresh'));

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('autowiki_knowledge_graph_settings');
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error("Failed to parse saved graph settings", e);
      }
    }

    apiFetch(`/api/projects`)
      .then(r => r.json())
      .then((data: ProjectItem[]) => {
        setProjects(data);
        const urlId = searchParams.get('projectId');
        if (urlId) setSelectedProjectId(Number(urlId));
        else if (data.length > 0) setSelectedProjectId(data[0].id);
      })
      .catch(console.error);
  }, []);

  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    localStorage.setItem('autowiki_knowledge_graph_settings', JSON.stringify(settings));
  }, [settings]);

  const deselectAll = useCallback(() => {
    lastSelectedNodeId.current = null;
    setSelectedNode(null);
    setSelectedLink(null);
    setEditPanel(null);
    setConnectingFrom(null);
    setConnectModalOpen(false);
    setConnectTarget(null);
    setDeleteConfirm(null);
    setError('');
  }, []);

  const resetLayout = () => window.dispatchEvent(new Event('graph:reset'));

  const handleProjectChange = (id: number) => {
    setSelectedProjectId(id);
    router.replace(`/dashboard/graph?projectId=${id}`);
    deselectAll();
  };

  const handleNodeSelect = (node: any) => {
    if (connectingFrom) {
      if (connectingFrom.id === node.id) return;
      setConnectTarget(node);
      setConnectLabel('');
      setConnectModalOpen(true);
      return;
    }
    setSelectedLink(null);
    setDeleteConfirm(null);
    setSelectedNode(node);
    setNodeName(node.name);
    setNodeIsRoot(!!node.is_root);
    setEditPanel('node');
    setError('');
  };

  const handleLinkSelect = (link: any) => {
    setSelectedNode(null);
    setDeleteConfirm(null);
    setSelectedLink(link);
    setLinkLabel(link.label ?? '');
    setEditPanel('link');
    setError('');
  };

  // Node Auto-save
  const lastSelectedNodeId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedNode) {
      lastSelectedNodeId.current = null;
      return;
    }
    
    // 처음 선택했을 때 바로 저장되는 것을 방지
    if (lastSelectedNodeId.current !== selectedNode.id) {
      lastSelectedNodeId.current = selectedNode.id;
      return;
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await apiFetch(`/api/entities/${selectedNode.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nodeName, is_root: nodeIsRoot, type: selectedNode.type }),
        });
        if (res.ok) {
          // 루트가 바뀌었거나 이름이 바뀌었으므로 그래프 갱신
          refreshGraph();
        }
      } catch (e) {
        console.error("Auto-save failed", e);
      } finally {
        setSaving(false);
      }
    }, 600); // 0.6초 디바운스

    return () => clearTimeout(timer);
  }, [nodeName, nodeIsRoot, selectedNode]);

  // Node Delete
  const deleteNode = async () => {
    if (!selectedNode) return;
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`/api/wiki/${selectedNode.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).detail ?? '삭제 실패');
      refreshGraph(); deselectAll();
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  const startConnect = () => {
    setConnectingFrom(selectedNode);
    setEditPanel('link-connect');
    setSelectedNode(null);
  };
  const cancelConnect = () => {
    setConnectingFrom(null); setConnectModalOpen(false); setConnectTarget(null); setEditPanel(null);
  };

  const confirmConnect = async () => {
    if (!connectingFrom || !connectTarget) return;
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`/api/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: connectingFrom.id, target: connectTarget.id, label: connectLabel.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? '엣지 생성 실패');
      refreshGraph(); cancelConnect();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const saveLink = async () => {
    if (!selectedLink) return;
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`/api/relationships/${selectedLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: linkLabel }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? '저장 실패');
      refreshGraph(); setSelectedLink((p: any) => ({ ...p, label: linkLabel }));
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const deleteLink = async () => {
    if (!selectedLink) return;
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`/api/relationships/${selectedLink.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).detail ?? '삭제 실패');
      refreshGraph(); deselectAll();
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // ─── UI helpers ──────────────────────────────────────────
  const ErrBox = () => error ? (
    <div className="flex items-center gap-2 bg-red-900/15 border border-red-800/30 text-red-400 text-xs px-3 py-2 rounded-md">
      <AlertTriangle size={11} /> {error}
    </div>
  ) : null;

  const ConfirmDelete = ({ onConfirm, onCancel, message }: { onConfirm: () => void; onCancel: () => void; message: string }) => (
    <div className="space-y-2">
      <p className="text-[#f87171] text-xs text-center">{message}</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={saving}
          className="flex-1 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-[#f87171] text-xs font-bold py-1.5 rounded-md transition-all disabled:opacity-40">
          삭제 확인
        </button>
        <button onClick={onCancel}
          className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-[#181818] dark:hover:bg-[#222] border border-slate-250 dark:border-[#2a2a2a] text-slate-500 dark:text-[#777] text-xs py-1.5 rounded-md transition-all">
          취소
        </button>
      </div>
    </div>
  );

  const SidePanel = ({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) => (
    <div className="absolute left-5 top-1/2 -translate-y-1/2 z-20 w-68" style={{ animation: 'slideIn .18s ease' }}>
      <div className="bg-white dark:bg-[#0e0e0e] border border-slate-200 dark:border-[#252525] rounded-xl shadow-2xl overflow-hidden w-64">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#1e1e1e]">
          <span className="text-slate-700 dark:text-[#ccc] text-sm font-semibold">{title}</span>
          <button onClick={onClose} className="text-slate-400 dark:text-[#555] hover:text-slate-600 dark:hover:text-[#aaa] transition-colors"><X size={14} /></button>
        </div>
        <div className="px-4 py-4 space-y-4">{children}</div>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="w-full h-[calc(100vh-64px)] relative flex">

      {/* Graph area */}
      <div className="flex-1 relative min-w-0">

        {/* Overlay header & controls combined */}
        <div className="absolute top-5 left-5 right-5 z-10 flex flex-col md:flex-row md:items-start justify-between gap-4 pointer-events-none">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white drop-shadow-sm dark:drop-shadow-lg flex items-center gap-2">
              <span className="bg-[#a855f7]/10 dark:bg-[#a855f7]/20 px-2 py-0.5 rounded text-[#a855f7] dark:text-[#c084fc] text-xs font-mono uppercase tracking-tighter">Wiki</span>
              {selectedProject ? `${selectedProject.name} — 지식 구조도` : '지식 구조도'}
            </h1>
            <p className="text-slate-500 dark:text-[#666] text-[10px] md:text-xs drop-shadow hidden sm:block">
              {isEditMode
                ? '편집 모드: 노드·엣지를 클릭하여 선택하세요'
                : settings.layout === 'radial'
                ? '방사형 마인드맵 — 중심에서 뻗어나가는 지식 구조'
                : '자유 배치 — 드래그·줌·클릭으로 탐색'}
            </p>

            {/* Controls moved under title */}
            <div className="flex flex-wrap items-center gap-2 mt-2 pointer-events-auto">
              {/* Settings toggle */}
              <button
                onClick={() => setShowSettings(v => !v)}
                className={`flex items-center gap-1.5 text-[10px] md:text-xs font-semibold rounded-md px-2.5 py-1.5 border transition-all shadow-lg ${
                  showSettings
                    ? 'bg-purple-50 dark:bg-[#a855f7]/20 border-purple-200 dark:border-[#a855f7]/50 text-purple-700 dark:text-[#c084fc]'
                    : 'bg-white/95 dark:bg-gray-900/90 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-300 hover:border-slate-350 dark:hover:border-gray-700 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Settings2 size={12} />
                설정
              </button>

              {/* Reset button */}
              <button
                onClick={resetLayout}
                title="배치 초기화 (핀 해제)"
                className="flex items-center gap-1.5 bg-white/95 dark:bg-gray-900/90 border border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-300 hover:border-slate-350 dark:hover:border-gray-700 hover:text-slate-800 dark:hover:text-white text-[10px] md:text-xs font-semibold rounded-md px-2.5 py-1.5 transition-all shadow-lg"
              >
                <RotateCcw size={12} />
                배치 초기화
              </button>

              {/* Edit mode toggle */}
              <button
                onClick={() => { setIsEditMode(v => !v); deselectAll(); }}
                className={`flex items-center gap-1.5 text-[10px] md:text-xs font-semibold rounded-md px-2.5 py-1.5 border transition-all shadow-lg ${
                  isEditMode
                    ? 'bg-amber-50 dark:bg-[#fbbf24]/15 border-amber-250 dark:border-[#fbbf24]/50 text-amber-700 dark:text-[#fbbf24]'
                    : 'bg-white/95 dark:bg-gray-900/90 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-300 hover:border-slate-350 dark:hover:border-gray-700 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Edit3 size={12} />
                {isEditMode ? '편집 중' : '편집'}
              </button>

              {/* Project selector */}
              <div className="relative">
                <select
                  value={selectedProjectId ?? ''}
                  onChange={e => handleProjectChange(Number(e.target.value))}
                  className="appearance-none bg-white/95 dark:bg-gray-900/90 border border-slate-200 dark:border-gray-800 text-slate-800 dark:text-white text-[10px] md:text-xs font-semibold rounded-md pl-2.5 pr-6 py-1.5 cursor-pointer focus:outline-none focus:border-slate-400 dark:focus:border-gray-650 transition-colors shadow-lg"
                >
                  {projects.length === 0 && <option value="" disabled>프로젝트 없음</option>}
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Graph canvas */}
        <KnowledgeGraph
          projectId={selectedProjectId}
          settings={settings}
          editMode={isEditMode}
          selectedNodeId={selectedNode?.id ?? connectingFrom?.id ?? null}
          selectedLinkId={selectedLink?.id ?? null}
          onNodeSelect={handleNodeSelect}
          onLinkSelect={handleLinkSelect}
          onDeselect={deselectAll}
        />

        {/* ─── Node Edit Panel ─────────── */}
        {isEditMode && editPanel === 'node' && selectedNode && (
          <SidePanel title="노드 편집" onClose={deselectAll}>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-[#555] uppercase tracking-widest block mb-1.5">이름</label>
              <input
                value={nodeName}
                onChange={e => setNodeName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#2a2a2a] text-slate-800 dark:text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-slate-350 dark:focus:border-[#444] transition-colors"
                placeholder="노드 이름을 입력하세요..."
              />
            </div>
            
            <div className="py-2 px-1">
              <Toggle
                label="루트 노드로 설정 (핵심 주제)"
                value={nodeIsRoot}
                onToggle={() => setNodeIsRoot(!nodeIsRoot)}
              />
              <p className="text-[10px] text-slate-400 dark:text-[#444] mt-1 italic">* 루트 노드 설정 시 다른 루트는 자동 해제됩니다.</p>
            </div>

            <div className="flex items-center gap-2 px-1 mb-2">
              <div className={`w-1.5 h-1.5 rounded-full ${saving ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[10px] text-slate-500 dark:text-[#555] font-medium">{saving ? '저장 중...' : '자동 저장됨'}</span>
            </div>

            <ErrBox />
            
            <div className="flex gap-2">
              <button onClick={startConnect}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800/40 text-blue-600 dark:text-blue-400 text-xs font-bold py-2.5 rounded-md transition-all"
                title="이 노드에서 엣지 연결">
                <LinkIcon size={12} /> 새 관계 연결
              </button>
            </div>
            {deleteConfirm === 'node'
              ? <ConfirmDelete
                  message="이 노드와 연결된 모든 엣지가 삭제됩니다."
                  onConfirm={deleteNode}
                  onCancel={() => setDeleteConfirm(null)}
                />
              : <button onClick={() => setDeleteConfirm('node')}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-900/25 text-red-600 dark:text-[#f87171] text-xs py-2 rounded-md transition-all">
                  <Trash2 size={12} /> 노드 삭제
                </button>
            }
          </SidePanel>
        )}

        {/* ─── Connect Mode Banner ─────── */}
        {isEditMode && editPanel === 'link-connect' && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
            <div className="bg-[#1a1200] border border-[#fbbf24]/40 text-[#fbbf24] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold backdrop-blur-sm">
              <PlusCircle size={14} />
              <span><strong>{connectingFrom?.name}</strong>에서 연결할 노드를 클릭하세요</span>
              <button onClick={cancelConnect} className="ml-1 text-[#fbbf24]/50 hover:text-[#fbbf24] transition-colors"><X size={13} /></button>
            </div>
          </div>
        )}

        {/* ─── Connect Modal ───────────── */}
        {connectModalOpen && connectTarget && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#0e0e0e] border border-slate-200 dark:border-[#252525] rounded-xl shadow-2xl w-72 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#1e1e1e]">
                <span className="text-slate-750 dark:text-[#ccc] text-sm font-semibold">엣지 생성</span>
                <button onClick={cancelConnect} className="text-slate-400 dark:text-[#555] hover:text-slate-600 dark:hover:text-[#aaa] transition-colors"><X size={14} /></button>
              </div>
              <div className="px-4 py-4 space-y-4">
                <div className="text-center text-xs text-slate-500 dark:text-[#666]">
                  <span className="text-slate-800 dark:text-white font-bold">{connectingFrom?.name}</span>
                  <span className="mx-2 text-[#a855f7]">→</span>
                  <span className="text-slate-800 dark:text-white font-bold">{connectTarget?.name}</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 dark:text-[#555] uppercase tracking-widest block mb-1.5">관계 레이블 (선택)</label>
                  <input
                    value={connectLabel}
                    onChange={e => setConnectLabel(e.target.value)}
                    placeholder="예: 개발함, 소속됨, 활용됨"
                    className="w-full bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#2a2a2a] text-slate-800 dark:text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-slate-350 dark:focus:border-[#444] transition-colors"
                    onKeyDown={e => e.key === 'Enter' && confirmConnect()}
                    autoFocus
                  />
                </div>
                <ErrBox />
                <div className="flex gap-2">
                  <button onClick={confirmConnect} disabled={saving}
                    className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-250 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold py-2 rounded-md transition-all disabled:opacity-40">
                    <Check size={12} className="inline mr-1" /> 생성
                  </button>
                  <button onClick={cancelConnect}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-[#161616] dark:hover:bg-[#1e1e1e] border border-slate-250 dark:border-[#2a2a2a] text-slate-500 dark:text-[#777] text-xs py-2 rounded-md transition-all">
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Link Edit Panel ─────────── */}
        {isEditMode && editPanel === 'link' && selectedLink && (
          <SidePanel title="엣지 편집" onClose={deselectAll}>
            <div className="text-xs text-slate-500 dark:text-[#555] text-center">
              <span className="text-slate-700 dark:text-[#888]">{selectedLink.source?.name ?? selectedLink.source}</span>
              <span className="mx-2 text-[#a855f7]">→</span>
              <span className="text-slate-700 dark:text-[#888]">{selectedLink.target?.name ?? selectedLink.target}</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-[#555] uppercase tracking-widest block mb-1.5">관계 레이블</label>
              <input
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#2a2a2a] text-slate-800 dark:text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-slate-350 dark:focus:border-[#444] transition-colors"
              />
            </div>
            <ErrBox />
            <button onClick={saveLink} disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-250 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold py-2 rounded-md transition-all disabled:opacity-40">
              <Check size={12} /> 저장
            </button>
            {deleteConfirm === 'link'
              ? <ConfirmDelete
                  message="이 연결을 삭제하시겠습니까?"
                  onConfirm={deleteLink}
                  onCancel={() => setDeleteConfirm(null)}
                />
              : <button onClick={() => setDeleteConfirm('link')}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-900/25 text-red-600 dark:text-[#f87171] text-xs py-2 rounded-md transition-all">
                  <Trash2 size={12} /> 엣지 삭제
                </button>
            }
          </SidePanel>
        )}
      </div>

      {/* ─── Settings Side Panel ─────────────────────────────── */}
      {showSettings && (
        <>
          {/* Mobile Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
            onClick={() => setShowSettings(false)}
          />
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        </>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translate(-10px, -50%); }
          to   { opacity: 1; transform: translate(0, -50%); }
        }
      `}</style>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#0a0a0a]" />}>
      <GraphPageInner />
    </Suspense>
  );
}
