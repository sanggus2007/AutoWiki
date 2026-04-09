"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { typeToColor, assignTypeColors, TYPE_COLOR_NONE } from '@/lib/typeColor';
import { apiFetch } from "@/lib/api";


const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-[#555] text-sm">
      신경망 초기화 중...
    </div>
  ),
});

// ─── Public Types ──────────────────────────────────────────────────────────────

export interface GraphSettings {
  layout: 'radial' | 'force';
  nodeSizeMode: 'dynamic' | 'uniform';
  labelMode: 'always' | 'hover' | 'hidden';
  showParticles: boolean;
  showLinkLabels: boolean;
  chargeStrength: number;   // -800 ~ -50
  ringSpacing: number;      // 60 ~ 250 (radial only)
  linkDistance: number;     // 30 ~ 300
  theme: 'dark' | 'cosmos' | 'neon' | 'forest';
}

export const DEFAULT_SETTINGS: GraphSettings = {
  layout: 'radial',
  nodeSizeMode: 'dynamic',
  labelMode: 'always',
  showParticles: true,
  showLinkLabels: false,
  chargeStrength: -320,
  ringSpacing: 140,
  linkDistance: 100,
  theme: 'dark',
};

// ─── Theme Palette ─────────────────────────────────────────────────────────────

const THEMES = {
  dark: {
    bg: '#0a0a0a',
    gridDot: '#1e1e1e',
    linkDefault: 'rgba(110,110,130,0.22)',
    linkTree: 'rgba(190,190,210,0.55)',
    particleColor: 'rgba(200,200,255,0.7)',
    labelBg: 'rgba(0,0,0,0.78)',
    labelText: '#ffffff',
    linkLabelText: '#aaaaaa',
  },
  cosmos: {
    bg: '#03030e',
    gridDot: '#0a0a22',
    linkDefault: 'rgba(60,90,200,0.28)',
    linkTree: 'rgba(100,160,255,0.6)',
    particleColor: 'rgba(120,180,255,0.8)',
    labelBg: 'rgba(4,4,28,0.82)',
    labelText: '#c8deff',
    linkLabelText: '#7aaeff',
  },
  neon: {
    bg: '#060009',
    gridDot: '#12001a',
    linkDefault: 'rgba(150,50,240,0.28)',
    linkTree: 'rgba(210,100,255,0.62)',
    particleColor: 'rgba(230,130,255,0.85)',
    labelBg: 'rgba(12,0,22,0.82)',
    labelText: '#f0ccff',
    linkLabelText: '#cc80ff',
  },
  forest: {
    bg: '#020906',
    gridDot: '#0a1f0e',
    linkDefault: 'rgba(50,140,60,0.28)',
    linkTree: 'rgba(100,220,120,0.58)',
    particleColor: 'rgba(140,255,160,0.8)',
    labelBg: 'rgba(2,14,6,0.82)',
    labelText: '#c8ffcc',
    linkLabelText: '#80ee90',
  },
} as const;

// ─── Graph Metric Computation ──────────────────────────────────────────────────

interface GraphMetrics {
  degree: Record<string, number>;
  depth: Record<string, number>;
  rootId: string | null;
  treeEdges: Set<string>;
  adjList: Record<string, string[]>;
  children: Record<string, string[]>; // spanning-tree children
}

function computeMetrics(nodes: any[], links: any[]): GraphMetrics {
  const degree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  const children: Record<string, string[]> = {};

  nodes.forEach(n => { degree[n.id] = 0; adjList[n.id] = []; children[n.id] = []; });

  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    degree[src] = (degree[src] || 0) + 1;
    degree[tgt] = (degree[tgt] || 0) + 1;
    if (!adjList[src]) adjList[src] = [];
    if (!adjList[tgt]) adjList[tgt] = [];
    adjList[src].push(tgt);
    adjList[tgt].push(src);
  });

  let rootId: string | null = null;
  let maxDeg = -1;
  const rootNode = nodes.find(n => n.is_root);
  if (rootNode) {
    rootId = rootNode.id;
  } else {
    nodes.forEach(n => {
      if ((degree[n.id] || 0) > maxDeg) { maxDeg = degree[n.id] || 0; rootId = n.id; }
    });
  }
  if (!rootId && nodes.length > 0) rootId = nodes[0].id;

  const depth: Record<string, number> = {};
  const treeEdges = new Set<string>();
  if (rootId) {
    const queue: string[] = [rootId];
    depth[rootId] = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const nb of adjList[curr] || []) {
        if (depth[nb] === undefined) {
          depth[nb] = depth[curr] + 1;
          treeEdges.add(`${curr}|${nb}`);
          treeEdges.add(`${nb}|${curr}`);
          if (!children[curr]) children[curr] = [];
          children[curr].push(nb);
          queue.push(nb);
        }
      }
    }
  }
  const maxDepth = Object.values(depth).length > 0 ? Math.max(...Object.values(depth)) : 0;
  nodes.forEach(n => { if (depth[n.id] === undefined) depth[n.id] = maxDepth + 2; });

  return { degree, depth, rootId, treeEdges, adjList, children };
}

// ─── Segment intersection helper ──────────────────────────────────────────────

/** 두 선분 (p1→p2, p3→p4) 이 교차하는지 확인 */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const cross = (ux: number, uy: number, vx: number, vy: number) => ux * vy - uy * vx;
  const abx = bx - ax, aby = by - ay;
  const cdx = dx - cx, cdy = dy - cy;
  const denom = cross(abx, aby, cdx, cdy);
  if (Math.abs(denom) < 1e-10) return false; // 평행
  const acx = cx - ax, acy = cy - ay;
  const t = cross(acx, acy, cdx, cdy) / denom;
  const u = cross(acx, acy, abx, aby) / denom;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

// ─── Barycenter Radial Layout ──────────────────────────────────────────────────

/** 서브트리 크기 + Barycenter heuristic 기반 각도 배분 → 교차선 최소화 */
function applyRadialLayout(nodes: any[], metrics: GraphMetrics, ringSpacing: number): void {
  const { rootId, depth, children } = metrics;
  if (!rootId) return;

  // 서브트리 크기 계산 (반복 버전, 스택 오버플로 방지)
  const subtreeSize: Record<string, number> = {};
  const order: string[] = []; // post-order
  const stack: string[] = [rootId];
  const visited = new Set<string>();
  visited.add(rootId);
  while (stack.length > 0) {
    const id = stack[stack.length - 1];
    let pushed = false;
    for (const kid of children[id] || []) {
      if (!visited.has(kid)) { visited.add(kid); stack.push(kid); pushed = true; break; }
    }
    if (!pushed) { order.push(stack.pop()!); }
  }
  for (const id of order) {
    const kids = children[id] || [];
    subtreeSize[id] = 1 + kids.reduce((s, k) => s + (subtreeSize[k] || 1), 0);
  }

  // ── Barycenter heuristic: 형제 노드들을 교차 최소 순서로 재정렬 ────────────
  // 각 노드에 임시 barycenter 값(부모 각도 기준 서브트리 무게중심) 할당
  // → 형제 간 순서를 이 값 기준으로 정렬하면 교차 수 감소
  const sortedChildren: Record<string, string[]> = {};

  // 먼저 원래 순서로 임시 각도 계산 (barycenter 계산용)
  const tempAngle: Record<string, number> = { [rootId]: 0 };
  const tempQueue: Array<[string, number, number]> = [[rootId, 0, 2 * Math.PI]];
  while (tempQueue.length > 0) {
    const [id, start, end] = tempQueue.shift()!;
    const kids = children[id] || [];
    if (kids.length === 0) { sortedChildren[id] = []; continue; }
    const totalKids = kids.reduce((s, k) => s + (subtreeSize[k] || 1), 0);
    let cur = start;
    for (const kid of kids) {
      const frac = (subtreeSize[kid] || 1) / totalKids;
      const kidEnd = cur + (end - start) * frac;
      tempAngle[kid] = (cur + kidEnd) / 2;
      cur = kidEnd;
    }
    // barycenter: 각 자식의 temp 각도 기준 정렬
    sortedChildren[id] = [...kids].sort((a, b) => (tempAngle[a] ?? 0) - (tempAngle[b] ?? 0));
    for (const kid of sortedChildren[id]) {
      tempQueue.push([kid, tempAngle[kid] - 0.001, tempAngle[kid] + 0.001]);
    }
  }

  // Barycenter 반복 개선 (2 pass) — 부모 각도를 기준으로 자식 재정렬
  for (let pass = 0; pass < 2; pass++) {
    // BFS 순서로 각 노드의 확정 각도 범위 계산
    const passAngle: Record<string, number> = { [rootId]: 0 };
    const passQueue: Array<[string, number, number]> = [[rootId, 0, 2 * Math.PI]];
    while (passQueue.length > 0) {
      const [id, start, end] = passQueue.shift()!;
      const kids = sortedChildren[id] || [];
      if (kids.length === 0) continue;
      const totalKids = kids.reduce((s, k) => s + (subtreeSize[k] || 1), 0);
      let cur = start;
      for (const kid of kids) {
        const frac = (subtreeSize[kid] || 1) / totalKids;
        const kidEnd = cur + (end - start) * frac;
        passAngle[kid] = (cur + kidEnd) / 2;
        cur = kidEnd;
        passQueue.push([kid, passAngle[kid] - (end - start) * 0.5, passAngle[kid] + (end - start) * 0.5]);
      }
      // 형제 간 barycenter 재정렬
      sortedChildren[id] = [...kids].sort((a, b) => (passAngle[a] ?? 0) - (passAngle[b] ?? 0));
    }
  }

  // ── 확정 각도 구간 배분 (정렬된 자식 순서 사용) ─────────────────────────────
  const nodeAngle: Record<string, number> = {};
  const sectors: Array<[string, number, number]> = [[rootId, 0, 2 * Math.PI]];
  while (sectors.length > 0) {
    const [id, start, end] = sectors.shift()!;
    nodeAngle[id] = (start + end) / 2;
    const kids = sortedChildren[id] || children[id] || [];
    if (kids.length === 0) continue;
    const totalKids = kids.reduce((s, k) => s + (subtreeSize[k] || 1), 0);
    let cur = start;
    for (const kid of kids) {
      const frac = (subtreeSize[kid] || 1) / totalKids;
      const next = cur + (end - start) * frac;
      sectors.push([kid, cur, next]);
      cur = next;
    }
  }

  // 위치 적용
  for (const node of nodes) {
    if (node.id === rootId) {
      node.fx = 0; node.fy = 0; node.x = 0; node.y = 0;
    } else {
      node.fx = undefined; node.fy = undefined;
      const d = depth[node.id] ?? 1;
      const r = d * ringSpacing;
      const angle = nodeAngle[node.id] ?? (Math.random() * 2 * Math.PI);
      node.x = r * Math.cos(angle);
      node.y = r * Math.sin(angle);
    }
  }
}

// ─── Dynamic Edge Distance ────────────────────────────────────────────────────

/**
 * 엣지별 유동 linkDistance 계산.
 * 밀집 구간(두 노드의 degree 합이 크거나 triangle이 많은 경우)은 더 길게,
 * 희소 구간은 짧게 설정하여 교차·겹침을 완화한다.
 */
function computeEdgeDistances(
  links: any[],
  metrics: GraphMetrics,
  baseDist: number,
): Map<string | number, number> {
  const { degree, treeEdges, adjList } = metrics;
  const result = new Map<string | number, number>();

  // 노드 쌍 간 공통 이웃 수(triangle factor) 계산
  const triangleCount = (srcId: string, tgtId: string): number => {
    const srcNb = new Set(adjList[srcId] || []);
    return (adjList[tgtId] || []).filter(n => srcNb.has(n)).length;
  };

  // 같은 source/target을 공유하는 병렬 엣지 감지
  const parallelCount = new Map<string, number>();
  for (const link of links) {
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    const key = [src, tgt].sort().join('|');
    parallelCount.set(key, (parallelCount.get(key) ?? 0) + 1);
  }

  for (const link of links) {
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    const isTree = treeEdges.has(`${src}|${tgt}`);

    const degSum = (degree[src] || 0) + (degree[tgt] || 0);
    const triangles = triangleCount(src, tgt);
    const key = [src, tgt].sort().join('|');
    const parallel = parallelCount.get(key) ?? 1;

    // 밀집도 배율: degree 합 + triangle 수 + 병렬 엣지 수 반영
    let densityFactor = 1.0;
    densityFactor += Math.min(degSum / 20, 0.8);   // degree 기여 (최대 +0.8)
    densityFactor += Math.min(triangles / 5, 0.6); // triangle 기여 (최대 +0.6)
    densityFactor += (parallel - 1) * 0.4;         // 병렬 엣지 기여

    // Tree 엣지는 기본 거리, non-tree 엣지는 약간 짧게
    const base = isTree ? baseDist : baseDist * 0.8;
    const dist = Math.round(base * densityFactor);

    result.set(link.id, Math.max(40, Math.min(dist, baseDist * 3.5)));
  }

  return result;
}

// ─── Edge Cross Repulsion Force ────────────────────────────────────────────────

/**
 * 교차하는 엣지 쌍을 감지하고, 해당 엣지의 노드들을 서로 밀어내는 커스텀 D3 force.
 * alpha가 낮아질수록 자동 감쇠. 엣지가 많은 경우 샘플링 검사.
 */
function makeEdgeCrossRepulsion(links: any[], strength = 0.08) {
  return function crossRepulsion(alpha: number) {
    if (alpha < 0.05) return; // 거의 수렴하면 비활성화
    const effectiveStrength = strength * alpha;

    const MAX_PAIRS = 5000; // 성능 상한선
    const n = links.length;
    // 100개 초과 시 샘플링: sqrt(MAX_PAIRS / n²) 비율만 검사
    const sampleRate = n * n <= MAX_PAIRS * 2 ? 1 : Math.sqrt(MAX_PAIRS / (n * n));

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // 샘플링: 랜덤 스킵
        if (sampleRate < 1 && Math.random() > sampleRate) continue;

        const li = links[i];
        const lj = links[j];
        const as = li.source, at = li.target;
        const bs = lj.source, bt = lj.target;

        // 공유 노드 있으면 스킵 (인접 엣지는 당연히 "교차점"처럼 보임)
        if (!as?.x || !at?.x || !bs?.x || !bt?.x) continue;
        if (as === bs || as === bt || at === bs || at === bt) continue;

        if (!segmentsIntersect(as.x, as.y, at.x, at.y, bs.x, bs.y, bt.x, bt.y)) continue;

        // 두 엣지 중점의 반발: 각 엣지 중점이 다른 엣지 중점에서 멀어지도록
        const midAx = (as.x + at.x) / 2, midAy = (as.y + at.y) / 2;
        const midBx = (bs.x + bt.x) / 2, midBy = (bs.y + bt.y) / 2;
        const dx = midAx - midBx, dy = midAy - midBy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const fx = (dx / dist) * effectiveStrength * 30;
        const fy = (dy / dist) * effectiveStrength * 30;

        // 엣지 A의 두 노드를 B 방향 반대로
        as.vx = (as.vx || 0) + fx; as.vy = (as.vy || 0) + fy;
        at.vx = (at.vx || 0) + fx; at.vy = (at.vy || 0) + fy;
        // 엣지 B의 두 노드를 A 방향 반대로
        bs.vx = (bs.vx || 0) - fx; bs.vy = (bs.vy || 0) - fy;
        bt.vx = (bt.vx || 0) - fx; bt.vy = (bt.vy || 0) - fy;
      }
    }
  };
}

// ─── Component Props ───────────────────────────────────────────────────────────

interface KnowledgeGraphProps {
  projectId?: number | null;
  settings: GraphSettings;
  editMode?: boolean;
  selectedNodeId?: string | null;
  selectedLinkId?: number | null;
  onNodeSelect?: (node: any) => void;
  onLinkSelect?: (link: any) => void;
  onDeselect?: () => void;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export const KnowledgeGraph = ({
  projectId,
  settings,
  editMode = false,
  selectedNodeId,
  selectedLinkId,
  onNodeSelect,
  onLinkSelect,
  onDeselect,
}: KnowledgeGraphProps) => {
  const router = useRouter();
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<any>(null);
  // 황금각 기반 색상 맵 — 타입 목록이 확정된 후 한 번에 배정
  const [colorMap, setColorMap] = useState<Map<string, string>>(new Map());

  const theme = THEMES[settings.theme];

  // ── Fetch ────────────────────────────────────────────────
  const fetchGraph = useCallback(() => {
    const url = projectId
      ? `/api/graph?project_id=${projectId}`
      : `/api/graph`;
    apiFetch(url)
      .then(r => r.json())
      .then(data => {
        const nodes: any[] = data.nodes || [];
        // 1) 전체 타입 목록 추출 후 황금각 색상 배정 (겹침 없음)
        const allTypes = [...new Set(nodes.map((n: any) => (n.type || '').trim()).filter(Boolean))];
        const cm = assignTypeColors(allTypes);
        setColorMap(cm);
        // 2) 각 노드 색상 적용
        const enriched = {
          ...data,
          nodes: nodes.map((n: any) => ({
            ...n,
            color: cm.get((n.type || '').trim()) ?? TYPE_COLOR_NONE,
          })),
        };
        setGraphData(enriched);
      })
      .catch(console.error);
  }, [projectId]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  useEffect(() => {
    const h = () => fetchGraph();
    window.addEventListener('graph:refresh', h);
    return () => window.removeEventListener('graph:refresh', h);
  }, [fetchGraph]);

  // ── Metrics ──────────────────────────────────────────────
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      setMetrics(computeMetrics(graphData.nodes, graphData.links));
    }
  }, [graphData]);

  // ── Resize ───────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Node radius ──────────────────────────────────────────
  const getRadius = useCallback((node: any): number => {
    if (!metrics || settings.nodeSizeMode === 'uniform') return 9;
    if (node.id === metrics.rootId) return 22;
    const d = metrics.degree[node.id] || 0;
    if (d >= 7) return 18;
    if (d >= 5) return 15;
    if (d >= 3) return 12;
    if (d >= 1) return 9;
    return 7;
  }, [metrics, settings.nodeSizeMode]);

  // ── Pre-position (radial: sector-based, force: free) ──────
  useEffect(() => {
    if (!metrics || !graphData.nodes.length) return;

    if (settings.layout === 'radial') {
      applyRadialLayout(graphData.nodes, metrics, settings.ringSpacing);
    } else {
      // 자유 배치: 루트 핀 해제
      graphData.nodes.forEach((n: any) => { n.fx = undefined; n.fy = undefined; });
    }

    graphData.nodes.forEach((node: any) => {
      node.val = Math.max(4, getRadius(node) ** 2 / 14);
    });
  }, [metrics, settings.layout, settings.ringSpacing, getRadius]);

  // ── Apply D3 forces ──────────────────────────────────────
  useEffect(() => {
    if (!graphRef.current || !metrics) return;

    const g = graphRef.current;
    g.d3Force('charge').strength(settings.chargeStrength);
    g.d3Force('link')?.distance(settings.linkDistance);

    // Remove old radial force
    g.d3Force('radial', null);

    if (settings.layout === 'radial' && metrics.rootId) {
      const ringSpacing = settings.ringSpacing;
      const depthMap = metrics.depth;

      // Custom radial force function (d3-force compatible API)
      const radialForce = function(alpha: number) {
        graphData.nodes.forEach((node: any) => {
          if (node.id === metrics.rootId) return; // root is fixed
          const depth = depthMap[node.id] ?? 1;
          const targetR = depth * ringSpacing;
          const nx = node.x || 0.001;
          const ny = node.y || 0.001;
          const currentR = Math.sqrt(nx * nx + ny * ny);
          if (currentR < 0.5) return;
          const err = (targetR - currentR) / currentR;
          const strength = 0.4 * alpha;
          node.vx = (node.vx || 0) + nx * err * strength;
          node.vy = (node.vy || 0) + ny * err * strength;
        });
      };
      g.d3Force('radial', radialForce);
    }

    g.d3ReheatSimulation();
    setTimeout(() => g.zoomToFit(700, 80), 1000);
  }, [settings.layout, settings.chargeStrength, settings.linkDistance, settings.ringSpacing, metrics]);

  // ── Initial zoom ─────────────────────────────────────────
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      setTimeout(() => graphRef.current?.zoomToFit(900, 80), 1400);
    }
  }, [graphData]);

  const isTreeEdge = useCallback((link: any): boolean => {
    if (!metrics) return false;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    return metrics.treeEdges.has(`${src}|${tgt}`);
  }, [metrics]);

  const isLinkHighlighted = useCallback((link: any) => {
    return (editMode && link.id === selectedLinkId) || (!editMode && hoveredLink && link.id === hoveredLink.id);
  }, [editMode, selectedLinkId, hoveredLink]);

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ background: theme.bg }}
    >
      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.18]"
        style={{
          backgroundImage: `radial-gradient(${theme.gridDot} 1px, transparent 1px)`,
          backgroundSize: '22px 22px',
        }}
      />

      {/* Empty state */}
      {graphData.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-[#444]">
            <div className="text-3xl mb-3 opacity-40">◎</div>
            <p className="text-sm">이 프로젝트에 아직 노드가 없습니다.</p>
            <p className="text-xs mt-1 opacity-70">파일을 업로드하여 지식 구조도를 생성하세요.</p>
          </div>
        </div>
      )}

      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel=""
        nodeColor={(n: any) => n.color}
        nodeRelSize={6}
        /* ── Links ── */
        linkColor={(link: any) => {
          if (isLinkHighlighted(link)) return 'rgba(251,191,36,0.95)';
          return isTreeEdge(link) ? theme.linkTree : theme.linkDefault.replace(/[\.\d]+\)$/, '0.45)');
        }}
        linkWidth={(link: any) => {
          if (isLinkHighlighted(link)) return 3.5;
          return isTreeEdge(link) ? 2 : 1.2;
        }}
        linkLineDash={(link: any) => (isTreeEdge(link) ? null : [4, 6])}
        linkDirectionalArrowLength={(link: any) => {
          if (isLinkHighlighted(link)) return 8;
          return isTreeEdge(link) ? 7 : 4;
        }}
        linkDirectionalArrowRelPos={0.88}
        linkDirectionalArrowColor={(link: any) => {
          if (isLinkHighlighted(link)) return 'rgba(251,191,36,0.95)';
          return isTreeEdge(link) ? theme.linkTree : theme.linkDefault.replace(/[\.\d]+\)$/, '0.65)');
        }}
        linkDirectionalParticles={(link: any) => {
          if (!settings.showParticles) return 0;
          return isTreeEdge(link) ? 3 : 0;
        }}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleWidth={2.2}
        linkDirectionalParticleColor={() => theme.particleColor}
        /* ── Link labels ── */
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          if (!settings.showLinkLabels) return;
          const label = link.label as string;
          if (!label || globalScale < 0.35) return;
          const src = link.source;
          const tgt = link.target;
          if (!src?.x || !tgt?.x) return;
          const midX = (src.x + tgt.x) / 2;
          const midY = (src.y + tgt.y) / 2;
          // Fix: Grow with zoom, but stay readable when zoomed out
          const fs = Math.max(10, 7 / globalScale);
          ctx.font = `${fs}px 'Noto Sans KR', sans-serif`;
          const tw = ctx.measureText(label).width;
          const pad = 2.5 / globalScale;
          ctx.fillStyle = theme.labelBg;
          ctx.fillRect(midX - tw / 2 - pad, midY - fs / 2 - pad, tw + pad * 2, fs + pad * 2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = theme.linkLabelText;
          ctx.globalAlpha = 0.85;
          ctx.fillText(label, midX, midY);
          ctx.globalAlpha = 1;
        }}
        /* ── Misc ── */
        backgroundColor={theme.bg}
        minZoom={0.04}
        maxZoom={12}
        /* ── Events ── */
        onNodeClick={(node: any) => {
          setHoveredLink(null);
          if (editMode) { onNodeSelect?.(node); return; }
          graphRef.current?.centerAt(node.x, node.y, 800);
          graphRef.current?.zoom(3, 800);
          if (node.id) setTimeout(() => router.push(`/dashboard/wiki/${node.id}`), 600);
        }}
        onLinkClick={(link: any) => { 
          if (editMode) {
            onLinkSelect?.(link); 
          }
        }}
        onBackgroundClick={() => { 
          setHoveredLink(null);
          if (editMode) onDeselect?.(); 
        }}
        onNodeHover={(node: any) => setHoveredNodeId(node?.id ?? null)}
        onLinkHover={(link: any) => {
          if (!editMode) setHoveredLink(link);
        }}
        /* ── Node canvas ── */
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const radius = getRadius(node);
          const isRoot = node.id === metrics?.rootId;
          const isSelected = editMode && node.id === selectedNodeId;
          const isHovered = node.id === hoveredNodeId;
          const isDimmed = editMode && !!selectedNodeId && !isSelected;

          ctx.globalAlpha = isDimmed ? 0.3 : 1.0;

          /* Root outer pulse ring */
          if (isRoot) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 9, 0, 2 * Math.PI);
            ctx.strokeStyle = `${node.color}40`;
            ctx.lineWidth = 4;
            ctx.stroke();
          }

          /* Hover / selection ring */
          if (isSelected) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 6, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(251,191,36,0.95)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
          } else if (isHovered && !editMode) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          /* Node fill w/ glow */
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = node.color;
          ctx.shadowColor = node.color;
          ctx.shadowBlur = isRoot ? 24 : isHovered ? 16 : 9;
          ctx.fill();
          ctx.shadowBlur = 0;

          /* Depth ring inside root node */
          if (isRoot) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius * 0.55, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();
          }

          /* Label */
          const showLabel =
            settings.labelMode === 'always' ||
            (settings.labelMode === 'hover' && isHovered);

          if (showLabel) {
            const label = node.name as string;
            const basePx = isRoot ? 14 : 12;
            const fs = Math.max(basePx, 8 / globalScale);
            ctx.font = `${isRoot ? 'bold' : ''} ${fs}px 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif`;
            const tw = ctx.measureText(label).width;
            const pad = 3.5 / globalScale;
            const bx = node.x - tw / 2 - pad;
            const by = node.y + radius + 4 / globalScale;
            const bw = tw + pad * 2;
            const bh = fs + pad * 2;
            const rr = bh / 3.5;

            /* Pill background */
            ctx.fillStyle = isSelected ? 'rgba(251,191,36,0.18)' : theme.labelBg;
            ctx.beginPath();
            ctx.moveTo(bx + rr, by);
            ctx.lineTo(bx + bw - rr, by);
            ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
            ctx.lineTo(bx + bw, by + bh - rr);
            ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
            ctx.lineTo(bx + rr, by + bh);
            ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
            ctx.lineTo(bx, by + rr);
            ctx.quadraticCurveTo(bx, by, bx + rr, by);
            ctx.closePath();
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isSelected ? '#fbbf24' : theme.labelText;
            ctx.fillText(label, node.x, by + pad);
          }

          ctx.globalAlpha = 1;
        }}
        nodeCanvasObjectMode={() => 'replace'}
      />

      {/* 분류 패널 — 실제 프로젝트 분류 목록 + 색상 */}
      <div className="absolute bottom-6 right-6 pointer-events-none">
        <div
          className="border border-[#2e2e2e] px-4 py-3 rounded-md shadow-xl backdrop-blur-sm min-w-[130px]"
          style={{ background: `${theme.bg}e8` }}
        >
          <div className="text-[10px] text-[#555] font-bold uppercase tracking-widest mb-2.5">분류</div>
          {(Array.from(colorMap.entries()) as [string, string][])
            .sort(([a], [b]) => a.localeCompare(b, 'ko'))
            .map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: color, boxShadow: `0 0 6px ${color}88` }}
                />
                <span className="text-[12px] font-medium" style={{ color: theme.labelText + 'cc' }}>{type}</span>
              </div>
            ))
          }
          {graphData.nodes.length === 0 && (
            <div className="text-[10px] text-[#444]">노드 없음</div>
          )}
          <div className="mt-2.5 pt-2 border-t border-[#1e1e1e] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-[2px] flex-shrink-0 rounded" style={{ background: theme.linkTree }} />
              <span className="text-[10px] text-[#555]">핵심 연결</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 border-t border-dashed border-[#444] flex-shrink-0" />
              <span className="text-[10px] text-[#444]">부가 연결</span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit mode badge */}
      {editMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/35 text-[#fbbf24] text-[11px] font-semibold px-4 py-1.5 rounded-full tracking-wide backdrop-blur-sm">
            ✏️ 편집 모드 — 노드·엣지를 클릭하여 수정
          </div>
        </div>
      )}

      {/* Hovered Link Info Box (View Mode) */}
      {!editMode && hoveredLink && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
          <div 
            className="flex flex-col items-center border border-[#3e3e3e]/60 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] px-5 py-3 backdrop-blur-md"
            style={{ background: 'rgba(20,20,20,0.85)' }}
          >
            <div className="text-[10px] text-[#aaa] font-bold tracking-widest uppercase mb-1.5">관계 정보</div>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-semibold px-2.5 py-1 bg-white/5 border border-white/10 rounded-md" style={{ color: theme.labelText }}>
                {hoveredLink.source.name || hoveredLink.source.id}
              </span>
              <div className="flex flex-col items-center text-[#fbbf24]">
                <span className="text-[11px] font-medium bg-[#fbbf24]/10 px-2 py-0.5 rounded text-[#fbbf24] mb-1">
                  {hoveredLink.label || '연결됨'}
                </span>
                <svg width="40" height="8" viewBox="0 0 40 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 4H38M38 4L34 1M38 4L34 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="font-semibold px-2.5 py-1 bg-white/5 border border-white/10 rounded-md" style={{ color: theme.labelText }}>
                {hoveredLink.target.name || hoveredLink.target.id}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
