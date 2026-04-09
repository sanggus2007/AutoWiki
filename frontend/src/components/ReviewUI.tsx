"use client";

import React, { useMemo, useState } from "react";
import {
  CheckSquare, Square, Check,
  BrainCircuit, ChevronDown, ChevronUp,
  RefreshCw, MessageSquare, PencilLine, Files, Trash2
} from "lucide-react";

export interface NodeModel {
  id: string;
  name: string;
  type: string;
  categories: string[];
  summary: string;
}

export interface EdgeModel {
  source: string;
  target: string;
  label: string;
}

export interface PatchModel {
  entity_slug: string;
  entity_name: string;
  changes: string;
}

export interface DeleteModel {
  entity_slug: string;
  entity_name: string;
  reason: string;
}

export interface Proposal {
  filename: string;
  content_text: string;
  plan_summary?: string;
  patches?: PatchModel[];
  deletions?: DeleteModel[];
  nodes: NodeModel[];
  edges: EdgeModel[];
}

interface ReviewUIProps {
  proposals: Proposal[];
  onConfirm: (payloads: Proposal[]) => void;
  onReanalyze?: (feedback: string) => void;
}

// ── Plan summaries card ───────────────────────────────────────────────────────
const PlanSummariesCard: React.FC<{ items: { filename: string; summary: string }[] }> = ({ items }) => {
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;
  return (
    <div className="border border-[#a2a9b1] rounded-sm overflow-hidden mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#f0f4f8] hover:bg-[#e8eef5] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit size={16} className="text-[#0645ad] shrink-0" />
          <span className="font-bold text-[13px] text-[#0645ad]">AI 분석 계획</span>
          <span className="text-[11px] text-[#54595d] font-normal">— AI가 무엇을 어떻게 처리할지 설명합니다</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-[#54595d]" /> : <ChevronDown size={14} className="text-[#54595d]" />}
      </button>
      {expanded && (
        <div className="bg-white p-4 space-y-3">
          {items.map((item, i) => (
            <div key={i}>
              {items.length > 1 && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Files size={12} className="text-[#54595d]" />
                  <span className="text-[11px] text-[#54595d] font-mono">{item.filename}</span>
                </div>
              )}
              <div className="bg-[#f8f9fa] border-l-4 border-[#0645ad] px-4 py-2.5 text-[13px] text-[#202122] leading-relaxed rounded-sm">
                {item.summary}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main ReviewUI ──────────────────────────────────────────────────────────────
export const ReviewUI: React.FC<ReviewUIProps> = ({ proposals, onConfirm, onReanalyze }) => {
  const [feedback, setFeedback] = useState("");

  // ── Compute merged/deduped display arrays ───────────────────────────────────
  const { planItems, allNodes, allEdges, allPatches, allDeletions } = useMemo(() => {
    const planItems: { filename: string; summary: string }[] = [];
    const seenNodeIds = new Set<string>();
    const seenPatchSlugs = new Set<string>();
    const seenDeleteSlugs = new Set<string>();

    const allNodes: Array<NodeModel & { _file: string }>  = [];
    const allEdges: Array<EdgeModel & { _key: string }>   = [];
    const allPatches: Array<PatchModel & { _file: string }> = [];
    const allDeletions: Array<DeleteModel & { _file: string }> = [];

    for (const p of proposals) {
      if (p.plan_summary) planItems.push({ filename: p.filename, summary: p.plan_summary });

      for (const pt of (p.patches ?? [])) {
        if (!seenPatchSlugs.has(pt.entity_slug)) {
          seenPatchSlugs.add(pt.entity_slug);
          allPatches.push({ ...pt, _file: p.filename });
        }
      }

      for (const dl of (p.deletions ?? [])) {
        if (!seenDeleteSlugs.has(dl.entity_slug)) {
          seenDeleteSlugs.add(dl.entity_slug);
          allDeletions.push({ ...dl, _file: p.filename });
        }
      }

      for (const n of p.nodes) {
        if (!seenNodeIds.has(n.id)) {
          seenNodeIds.add(n.id);
          allNodes.push({ ...n, _file: p.filename });
        }
      }

      p.edges.forEach((e, idx) => {
        allEdges.push({ ...e, _key: `${p.filename}::${e.source}-${e.target}-${idx}` });
      });
    }

    return { planItems, allNodes, allEdges, allPatches, allDeletions };
  }, [proposals]);

  // ── Checked state (global keys) ─────────────────────────────────────────────
  const [checkedNodes, setCheckedNodes] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    allNodes.forEach(n => { init[n.id] = true; });
    return init;
  });

  const [checkedEdges, setCheckedEdges] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    allEdges.forEach(e => { init[e._key] = true; });
    return init;
  });

  const [checkedPatches, setCheckedPatches] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    allPatches.forEach(pt => { init[pt.entity_slug] = true; });
    return init;
  });

  const [checkedDeletions, setCheckedDeletions] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    allDeletions.forEach(dl => { init[dl.entity_slug] = true; });
    return init;
  });

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  const toggleAll = <T extends string>(
    keys: T[],
    checked: Record<string, boolean>,
    setChecked: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  ) => {
    const allOn = keys.every(k => checked[k]);
    setChecked(prev => {
      const next = { ...prev };
      keys.forEach(k => { next[k] = !allOn; });
      return next;
    });
  };

  // ── Confirm: rebuild per-proposal data from global state ────────────────────
  const handleConfirm = () => {
    const finalProposals: Proposal[] = proposals.map(p => ({
      ...p,
      nodes: p.nodes.filter(n => checkedNodes[n.id]),
      edges: p.edges.filter((e, idx) => checkedEdges[`${p.filename}::${e.source}-${e.target}-${idx}`]),
      patches: (p.patches ?? []).filter(pt => checkedPatches[pt.entity_slug]),
      deletions: (p.deletions ?? []).filter(dl => checkedDeletions[dl.entity_slug]),
    }));
    onConfirm(finalProposals);
  };

  const checkedNodeCount   = allNodes.filter(n => checkedNodes[n.id]).length;
  const checkedEdgeCount   = allEdges.filter(e => checkedEdges[e._key]).length;
  const checkedPatchCount  = allPatches.filter(pt => checkedPatches[pt.entity_slug]).length;
  const checkedDeletionCount = allDeletions.filter(dl => checkedDeletions[dl.entity_slug]).length;

  return (
    <div className="w-full max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-[#000000] mb-2">변경 사항 검토 (Review)</h2>
        <p className="text-[#54595d] text-[14px]">
          AI가 추출한 내용을 확인하세요. 저장하지 않을 항목은 체크를 해제하세요.
        </p>
        {proposals.length > 1 && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-[#f0f4f8] border border-[#a2a9b1] rounded-full text-[12px] text-[#54595d]">
            <Files size={12} />
            {proposals.length}개 파일에서 취합된 결과입니다
          </div>
        )}
      </div>

      {/* Plan summaries */}
      <PlanSummariesCard items={planItems} />

      <div className="space-y-4">

        {/* ── Deletions ────────────────────────────────────────────────── */}
        {allDeletions.length > 0 && (
          <Section
            title="삭제 될 기존 문서 (경고)"
            subtitle="체크 해제 시 삭제하지 않습니다"
            count={checkedDeletionCount}
            total={allDeletions.length}
            icon={<Trash2 size={15} className="text-[#dc2626]" />}
            titleColor="text-[#dc2626]"
            borderColor="border-[#fca5a5]"
            onToggleAll={() => toggleAll(allDeletions.map(d => d.entity_slug), checkedDeletions, setCheckedDeletions)}
          >
            <div className="space-y-2">
              {allDeletions.map(dl => {
                const isChecked = checkedDeletions[dl.entity_slug] ?? true;
                return (
                  <div
                    key={dl.entity_slug}
                    className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${isChecked ? 'border-[#fca5a5] bg-[#fef2f2]' : 'border-[#c8ccd1] bg-[#f8f9fa] opacity-60'}`}
                    onClick={() => setCheckedDeletions(prev => ({ ...prev, [dl.entity_slug]: !prev[dl.entity_slug] }))}
                  >
                    <div className="mt-0.5 mr-2.5 text-[#dc2626] shrink-0">
                      {isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-[#a2a9b1]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-[13px] text-[#000000] line-through decoration-[#dc2626]">{dl.entity_name}</span>
                        <span className="text-[11px] text-[#78716c] font-mono">[{dl.entity_slug}]</span>
                      </div>
                      <p className="text-[12px] text-[#54595d] mt-1 leading-relaxed"><strong className="text-[#dc2626]">삭제 사유:</strong> {dl.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Patches ──────────────────────────────────────────────────── */}
        {allPatches.length > 0 && (
          <Section
            title="수정될 기존 문서"
            subtitle="체크 해제 시 수정하지 않습니다"
            count={checkedPatchCount}
            total={allPatches.length}
            icon={<PencilLine size={15} className="text-[#b45309]" />}
            titleColor="text-[#b45309]"
            borderColor="border-[#fcd34d]"
            onToggleAll={() => toggleAll(allPatches.map(p => p.entity_slug), checkedPatches, setCheckedPatches)}
          >
            <div className="space-y-2">
              {allPatches.map(pt => {
                const isChecked = checkedPatches[pt.entity_slug] ?? true;
                return (
                  <div
                    key={pt.entity_slug}
                    className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${isChecked ? 'border-[#fcd34d] bg-[#fffbeb]' : 'border-[#c8ccd1] bg-[#f8f9fa] opacity-60'}`}
                    onClick={() => setCheckedPatches(prev => ({ ...prev, [pt.entity_slug]: !prev[pt.entity_slug] }))}
                  >
                    <div className="mt-0.5 mr-2.5 text-[#b45309] shrink-0">
                      {isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-[#a2a9b1]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-[13px] text-[#000000]">{pt.entity_name}</span>
                        <span className="text-[11px] text-[#78716c] font-mono">[{pt.entity_slug}]</span>
                      </div>
                      <p className="text-[12px] text-[#54595d] mt-1 leading-relaxed">{pt.changes}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Nodes ────────────────────────────────────────────────────── */}
        <Section
          title="새로 생성될 문서"
          count={checkedNodeCount}
          total={allNodes.length}
          borderColor="border-[#93c5fd]"
          onToggleAll={() => toggleAll(allNodes.map(n => n.id), checkedNodes, setCheckedNodes)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allNodes.map(n => {
              const isChecked = checkedNodes[n.id] ?? true;
              return (
                <div
                  key={n.id}
                  className={`flex items-start p-2 border rounded-sm cursor-pointer transition-colors ${isChecked ? 'border-[#0645ad] bg-[#f0f4f8]' : 'border-[#c8ccd1] bg-[#f8f9fa] opacity-60'}`}
                  onClick={() => setCheckedNodes(prev => ({ ...prev, [n.id]: !prev[n.id] }))}
                >
                  <div className="mt-0.5 mr-2 text-[#0645ad]">
                    {isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-[#a2a9b1]" />}
                  </div>
                  <div>
                    <div className="font-bold text-[13px] text-[#000000]">{n.name}</div>
                    <div className="text-[11px] text-[#54595d]">{n.type}</div>
                  </div>
                </div>
              );
            })}
            {allNodes.length === 0 && <div className="text-sm text-[#54595d] italic">추출된 노드가 없습니다.</div>}
          </div>
        </Section>

        {/* ── Edges ────────────────────────────────────────────────────── */}
        <Section
          title="새로 형성될 관계"
          count={checkedEdgeCount}
          total={allEdges.length}
          borderColor="border-[#6ee7b7]"
          onToggleAll={() => toggleAll(allEdges.map(e => e._key), checkedEdges, setCheckedEdges)}
        >
          <div className="space-y-2">
            {allEdges.map(e => {
              const isChecked = checkedEdges[e._key] ?? true;
              return (
                <div
                  key={e._key}
                  className={`flex items-center p-2 border rounded-sm cursor-pointer transition-colors ${isChecked ? 'border-[#0645ad] bg-[#f0f4f8]' : 'border-[#c8ccd1] bg-[#f8f9fa] opacity-60'}`}
                  onClick={() => setCheckedEdges(prev => ({ ...prev, [e._key]: !prev[e._key] }))}
                >
                  <div className="mr-3 text-[#0645ad]">
                    {isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-[#a2a9b1]" />}
                  </div>
                  <div className="text-[13px] text-[#202122] flex items-center space-x-2">
                    <span className="font-bold text-[#0645ad]">{e.source}</span>
                    <span className="text-[#54595d] text-[11px]">→ ({e.label}) →</span>
                    <span className="font-bold text-[#0645ad]">{e.target}</span>
                  </div>
                </div>
              );
            })}
            {allEdges.length === 0 && <div className="text-sm text-[#54595d] italic">추출된 관계가 없습니다.</div>}
          </div>
        </Section>
      </div>

      {/* Bottom actions */}
      <div className="mt-8 flex flex-col items-center gap-4">

        {onReanalyze && (
          <div className="w-full max-w-2xl border border-[#e0c97a] rounded-sm bg-white shadow-sm">
            <div className="bg-[#fffbeb] border-b border-[#e0c97a] px-4 py-2.5 flex items-center gap-2">
              <MessageSquare size={15} className="text-[#b45309] shrink-0" />
              <span className="font-bold text-[13px] text-[#b45309]">AI에게 개선 요청</span>
              <span className="text-[11px] text-[#78716c]">— 피드백을 입력하고 추출을 다시 요청합니다</span>
            </div>
            <div className="p-4">
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={3}
                placeholder="예: 관계를 더 세분화해 줘. 불필요한 항목은 빼줘."
                className="w-full border border-[#a2a9b1] rounded-sm px-3 py-2 text-[13px] text-[#202122] focus:outline-none focus:border-[#b45309] resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => { if (!feedback.trim()) return; onReanalyze(feedback.trim()); setFeedback(""); }}
                  disabled={!feedback.trim()}
                  className="flex items-center px-4 py-2 bg-[#b45309] text-white font-bold text-[13px] rounded-sm hover:bg-[#92400e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} className="mr-1.5" />다시 분석 요청
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleConfirm}
          className="flex items-center px-6 py-3 bg-[#0645ad] text-white font-bold rounded-sm hover:bg-[#0b0080] transition-colors shadow-sm text-[15px]"
        >
          <Check size={18} className="mr-2" />
          Confirm &amp; Apply (데이터베이스에 저장)
        </button>
      </div>
    </div>
  );
};

// ── Section wrapper component ─────────────────────────────────────────────────
const Section: React.FC<{
  title: string;
  subtitle?: string;
  count: number;
  total: number;
  icon?: React.ReactNode;
  titleColor?: string;
  borderColor?: string;
  onToggleAll: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, count, total, icon, titleColor = "text-[#202122]", borderColor = "border-[#a2a9b1]", onToggleAll, children }) => (
  <div className={`border ${borderColor} rounded-sm overflow-hidden`}>
    <div className={`bg-[#f8f9fa] border-b ${borderColor} px-4 py-2.5 flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className={`font-bold text-[14px] ${titleColor}`}>{title}</span>
        {subtitle && <span className="text-[11px] text-[#78716c] font-normal">{subtitle}</span>}
        <span className="text-[12px] text-[#54595d] font-mono ml-1">{count}/{total}건 선택됨</span>
      </div>
      <button
        onClick={onToggleAll}
        className="text-[12px] text-[#0645ad] hover:underline whitespace-nowrap"
      >
        {count === total ? "전체 해제" : "전체 선택"}
      </button>
    </div>
    <div className="p-4">{children}</div>
  </div>
);
