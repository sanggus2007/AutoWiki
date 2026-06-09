"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { typeToColor, assignTypeColors, TYPE_COLOR_NONE } from '@/lib/typeColor';
import { apiFetch } from "@/lib/api";
import * as THREE from 'three';
import { useTheme } from 'next-themes';


const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-[#555] text-sm">
      신경망 초기화 중...
    </div>
  ),
});

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-[#555] text-sm">
      3D 신경망 초기화 중...
    </div>
  ),
});

// ─── Public Types ──────────────────────────────────────────────────────────────

export interface GraphSettings {
  dimension: '2d' | '3d';
  layout: 'radial' | 'force';
  nodeSizeMode: 'dynamic' | 'uniform';
  labelMode: 'always' | 'hover' | 'hidden';
  showParticles: boolean;
  showLinkLabels: boolean;
  showSubLinkLabels: boolean;
  chargeStrength: number;   // -1200 ~ -50
  ringSpacing: number;      // 60 ~ 600 (radial only)
  linkDistance: number;     // 30 ~ 600
  theme: 'dark' | 'cosmos' | 'neon' | 'forest';
}

export const DEFAULT_SETTINGS: GraphSettings = {
  dimension: '2d',
  layout: 'radial',
  nodeSizeMode: 'dynamic',
  labelMode: 'always',
  showParticles: true,
  showLinkLabels: false,
  showSubLinkLabels: false,
  chargeStrength: -500,
  ringSpacing: 250,
  linkDistance: 280,
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
  light: {
    bg: '#f8f9fa',
    gridDot: '#e2e8f0',
    linkDefault: 'rgba(100,116,139,0.18)',
    linkTree: 'rgba(79,70,229,0.45)',
    particleColor: 'rgba(79,70,229,0.7)',
    labelBg: 'rgba(255,255,255,0.88)',
    labelText: '#0f172a',
    linkLabelText: '#475569',
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
      node.fx = 0; node.fy = 0; node.fz = 0;
      node.x = 0; node.y = 0; node.z = 0;
    } else {
      node.fx = undefined; node.fy = undefined; node.fz = undefined;
      const d = depth[node.id] ?? 1;
      const r = d * ringSpacing;
      const angle = nodeAngle[node.id] ?? (Math.random() * 2 * Math.PI);
      node.x = r * Math.cos(angle);
      node.y = r * Math.sin(angle);
      // 3D 공간에서도 중심 레이어에 가깝게 배치하여 초기 혼란 방지
      node.z = (Math.random() - 0.5) * 5;
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
  const [graphInstance, setGraphInstance] = useState<any>(null);

  const setGraphInstanceRef = useCallback((el: any) => {
    graphRef.current = el;
    setGraphInstance(el);
  }, []);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<any>(null);
  // 황금각 기반 색상 맵 — 타입 목록이 확정된 후 한 번에 배정
  const [colorMap, setColorMap] = useState<Map<string, string>>(new Map());
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [showCoreLinks, setShowCoreLinks] = useState(true);
  const [showSubLinks, setShowSubLinks] = useState(true);

  const [isFilterExpanded, setIsFilterExpanded] = useState(true);

  const { resolvedTheme } = useTheme();
  const activeThemeKey = settings.theme === 'dark' && resolvedTheme === 'light' ? 'light' : settings.theme;
  const theme = (THEMES[activeThemeKey as keyof typeof THEMES] || THEMES[settings.theme] || THEMES.dark) as any;

  // ── 3D Label Texture Cache ──────────────────────────────
  const textureCache = useRef<Map<string, THREE.Texture>>(new Map());

  // Clear cache if theme changes
  useEffect(() => {
    textureCache.current.forEach(t => t.dispose());
    textureCache.current.clear();

    // Clear cached sprites on nodes
    graphData.nodes.forEach((n: any) => {
      if (n.__sprite) {
        if (n.__sprite.material) n.__sprite.material.dispose();
        delete n.__sprite;
      }
    });
  }, [activeThemeKey, graphData.nodes]);

  const getOrCreateTexture = useCallback((node: any) => {
    const key = `${node.name || node.id}_${activeThemeKey}`;
    if (textureCache.current.has(key)) return textureCache.current.get(key)!;

    const label = node.name || node.id;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 64;
    ctx!.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx!.measureText(label).width;
    canvas.width = textWidth + 80;
    canvas.height = fontSize + 40;

    ctx!.fillStyle = theme.labelBg;
    ctx!.beginPath();
    ctx!.roundRect?.(0, 0, canvas.width, canvas.height, 20);
    ctx!.fill();

    ctx!.fillStyle = theme.labelText;
    ctx!.font = `bold ${fontSize}px sans-serif`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.fillText(label, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    textureCache.current.set(key, texture);
    return texture;
  }, [theme, activeThemeKey]);

  // ── Fetch ────────────────────────────────────────────────
  const fetchGraph = useCallback((isCurrent: { val: boolean } = { val: true }) => {
    if (projectId === null) {
      setGraphData({ nodes: [], links: [] });
      return;
    }
    const url = `/api/graph?project_id=${projectId}`;
    apiFetch(url)
      .then(r => r.json())
      .then(data => {
        if (!isCurrent.val) return;
        const nodes: any[] = data.nodes || [];
        const allTypes = [...new Set(nodes.map((n: any) => (n.type || '').trim()).filter(Boolean))];
        const cm = assignTypeColors(allTypes);
        setColorMap(cm);
        const enriched = {
          ...data,
          nodes: nodes.map((n: any) => ({
            ...n,
            color: cm.get((n.type || '').trim()) ?? TYPE_COLOR_NONE,
          })),
        };
        setGraphData(enriched);
      })
      .catch(err => {
        if (isCurrent.val) console.error(err);
      });
  }, [projectId]);

  useEffect(() => {
    const isCurrent = { val: true };
    fetchGraph(isCurrent);
    return () => { isCurrent.val = false; };
  }, [fetchGraph]);

  useEffect(() => {
    const h = () => fetchGraph();
    window.addEventListener('graph:refresh', h);
    const r = () => {
      // 모든 노드 속도/핀 초기화
      graphData.nodes.forEach((n: any) => {
        n.fx = undefined; n.fy = undefined; n.fz = undefined;
        n.vx = 0; n.vy = 0; n.vz = 0;
      });

      if (settings.layout === 'radial' && metrics) {
        applyRadialLayout(graphData.nodes, metrics, settings.ringSpacing);
      }

      const g = graphRef.current;
      if (g) {
        try {
          if (typeof g.d3ReheatSimulation === 'function') g.d3ReheatSimulation();
        } catch (err) {
          console.warn("Reset reheat failed:", err);
        }
        // 약간의 지연 후 핏 조정 (시뮬레이션이 한 프레임은 돌아야 위치가 반영됨)
        setTimeout(() => {
          if (typeof g.zoomToFit === 'function') g.zoomToFit(800, 80);
        }, 150);
      }
    };
    window.addEventListener('graph:reset', r);
    return () => {
      window.removeEventListener('graph:refresh', h);
      window.removeEventListener('graph:reset', r);
    };
  }, [fetchGraph, graphData.nodes, settings.layout, settings.ringSpacing, metrics]);

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
      graphData.nodes.forEach((n: any) => {
        n.fx = undefined; n.fy = undefined; n.fz = undefined;
      });
    }

    // 3D -> 2D 전환 시 Z축 잔상 제거
    if (settings.dimension === '2d') {
      graphData.nodes.forEach((n: any) => {
        delete n.z;
        delete n.vz;
        delete n.fz;
      });
    } else {
      // 3D로 전환 시 모든 노드에 z가 없으면 초기화
      graphData.nodes.forEach((n: any) => {
        if (n.z === undefined) n.z = (Math.random() - 0.5) * 10;
      });
    }

    graphData.nodes.forEach((node: any) => {
      node.val = Math.max(4, getRadius(node) ** 2 / 14);
    });

    // 레이아웃 적용 후 강제 리히트 및 핏 (최초 로드 시 꼬임 방지)
    // 2D <-> 3D 전환 시 엔진 초기화 대기를 위해 지연 실행 (tick 에러 방지)
    const timeoutId = setTimeout(() => {
      const g = graphRef.current;
      if (g && typeof g.d3ReheatSimulation === 'function') {
        try {
          g.d3ReheatSimulation();
          // 데이터가 많을 경우 대비하여 점진적으로 핏 조정
          setTimeout(() => g.zoomToFit?.(1000, 100), 200);
          setTimeout(() => g.zoomToFit?.(600, 120), 1000);
        } catch (err) {
          console.warn("Initial layout sync failed:", err);
        }
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [metrics, settings.layout, settings.ringSpacing, getRadius, settings.dimension, graphInstance]);

  const isTreeEdge = useCallback((link: any): boolean => {
    if (!metrics) return false;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    return metrics.treeEdges.has(`${src}|${tgt}`);
  }, [metrics]);

  // ── Apply D3 forces ──────────────────────────────────────
  useEffect(() => {
    if (!graphRef.current || !metrics) return;

    // Delay force updates to prevent "reading 'tick'" errors that occur
    // when ForceGraph3D's internal state.layout is not fully initialized.
    const timeoutId = setTimeout(() => {
      const g = graphRef.current;
      if (!g || typeof g.d3Force !== 'function') return;

      try {
        // Configure Three.js raycaster threshold for 3D lines
        if (settings.dimension === '3d' && typeof g.raycaster === 'function') {
          const rc = g.raycaster();
          if (rc && rc.params && rc.params.Line) {
            rc.params.Line.threshold = 15; // Make edge hover extremely easy and forgiving in 3D space
          }
        }

        const chargeForce = g.d3Force('charge');
        if (chargeForce && typeof chargeForce.strength === 'function') {
          chargeForce.strength(settings.chargeStrength);
        }

        const linkForce = g.d3Force('link');
        if (linkForce && typeof linkForce.distance === 'function') {
          linkForce.distance(settings.linkDistance)
            .strength((l: any) => isTreeEdge(l) ? 1.0 : 0.02);
        }

        if (g.d3Force('radial')) {
          g.d3Force('radial', null);
        }

        if (settings.layout === 'radial' && metrics.rootId) {
          const ringSpacing = settings.ringSpacing;
          const depthMap = metrics.depth;

          const radialForce = function (alpha: number) {
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
              if (settings.dimension === '3d') {
                const nz = node.z || 0.001;
                const currentR3D = Math.sqrt(nx * nx + ny * ny + nz * nz);
                const err3D = (targetR - currentR3D) / currentR3D;
                node.vx = (node.vx || 0) + nx * err3D * strength;
                node.vy = (node.vy || 0) + ny * err3D * strength;
                node.vz = (node.vz || 0) + nz * err3D * strength;
              }
            });
          };
          g.d3Force('radial', radialForce);
        }

        if (typeof g.d3ReheatSimulation === 'function') {
          g.d3ReheatSimulation();
        }

        // 수치 조정 시에는 핏(Zoom)을 하지 않음 (조작감 개선)
        // 레이아웃이나 차원이 바뀔 때만 레이아웃 효과에서 핏을 수행함
      } catch (err) {
        console.warn("Physics sync transiently failed:", err);
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [settings.layout, settings.chargeStrength, settings.linkDistance, settings.ringSpacing, metrics, isTreeEdge, settings.dimension, graphInstance]);

  // ── Initial zoom ─────────────────────────────────────────
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      // 이미 레이아웃 효과에서 처리하므로 여기서는 보조적인 핏만 수행
      const timer = setTimeout(() => {
        graphRef.current?.zoomToFit?.(800, 100);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length]); // 의존성 최적화

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
      {settings.dimension !== '3d' && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.18]"
          style={{
            backgroundImage: `radial-gradient(${theme.gridDot} 1px, transparent 1px)`,
            backgroundSize: '22px 22px',
          }}
        />
      )}

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

      {settings.dimension === '3d' ? (
        <ForceGraph3D
          ref={setGraphInstanceRef as any}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel={(n: any) => n.name}
          nodeVisibility={(n: any) => !hiddenTypes.has((n.type || '').trim())}
          linkVisibility={(l: any) => {
            const isTree = isTreeEdge(l);
            if (isTree && !showCoreLinks) return false;
            if (!isTree && !showSubLinks) return false;
            const sVisible = !hiddenTypes.has((l.source?.type || '').trim());
            const tVisible = !hiddenTypes.has((l.target?.type || '').trim());
            return sVisible && tVisible;
          }}
          nodeColor={(n: any) => n.color}
          nodeRelSize={6}
          linkHoverPrecision={10}
          /* ── 3D Label Rendering ── */
          nodeThreeObject={(node: any) => {
            const showLabel = settings.labelMode === 'always' || (settings.labelMode === 'hover' && node.id === hoveredNodeId);
            if (!showLabel) {
              if (node.__sprite) {
                if (node.__sprite.material) node.__sprite.material.dispose();
                delete node.__sprite;
              }
              return new THREE.Object3D();
            }

            if (node.__sprite) {
              return node.__sprite;
            }

            const texture = getOrCreateTexture(node);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true });
            const sprite = new THREE.Sprite(spriteMaterial);

            const scale = 0.20;
            const img = texture.image as HTMLImageElement;
            sprite.scale.set(img.width * scale, img.height * scale, 1);

            const _vec = new THREE.Vector3();
            const _up = new THREE.Vector3();
            sprite.onBeforeRender = (renderer, scene, camera) => {
              if (!sprite.parent) return;
              _vec.copy(camera.position).sub(sprite.parent.position).normalize();
              _up.copy(camera.up).normalize();
              sprite.position.copy(_up).multiplyScalar(22).add(_vec.multiplyScalar(8));
            };

            node.__sprite = sprite;
            return sprite;
          }}
          nodeThreeObjectExtend={true}
          // @ts-ignore
          linkStrength={(link: any) => isTreeEdge(link) ? 1.0 : 0.02}
          linkColor={(link: any) => {
            if (isLinkHighlighted(link)) return 'rgba(251,191,36,0.95)';
            return isTreeEdge(link) ? theme.linkTree.replace(/[\.\d]+\)$/, '0.85)') : theme.linkDefault.replace(/[\.\d]+\)$/, '0.65)');
          }}
          linkWidth={(link: any) => {
            if (isLinkHighlighted(link)) return 4.5;
            return isTreeEdge(link) ? 3.0 : 1.8;
          }}
          linkDirectionalArrowLength={(link: any) => {
            if (isLinkHighlighted(link)) return 9;
            return isTreeEdge(link) ? 8 : 5;
          }}
          linkDirectionalArrowRelPos={0.88}
          linkDirectionalArrowColor={(link: any) => {
            if (isLinkHighlighted(link)) return 'rgba(251,191,36,0.95)';
            return isTreeEdge(link) ? theme.linkTree.replace(/[\.\d]+\)$/, '0.85)') : theme.linkDefault.replace(/[\.\d]+\)$/, '0.75)');
          }}
          linkDirectionalParticles={(link: any) => {
            if (!settings.showParticles) return 0;
            return isTreeEdge(link) ? 3 : 0;
          }}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={2.2}
          linkDirectionalParticleColor={() => theme.particleColor}
          backgroundColor={theme.bg}
          onNodeClick={(node: any) => {
            setHoveredLink(null);
            if (editMode) { onNodeSelect?.(node); return; }
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
        />
      ) : (
        <ForceGraph2D
          ref={setGraphInstanceRef as any}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel=""
          nodeVisibility={(n: any) => !hiddenTypes.has((n.type || '').trim())}
          linkVisibility={(l: any) => {
            const isTree = isTreeEdge(l);
            if (isTree && !showCoreLinks) return false;
            if (!isTree && !showSubLinks) return false;
            // source/target are objects during simulation
            const sVisible = !hiddenTypes.has((l.source?.type || '').trim());
            const tVisible = !hiddenTypes.has((l.target?.type || '').trim());
            return sVisible && tVisible;
          }}
          nodeColor={(n: any) => n.color}
          nodeRelSize={6}
          linkHoverPrecision={6}
          /* ── Links ── */
          // @ts-ignore
          linkStrength={(link: any) => isTreeEdge(link) ? 1.0 : 0.02}
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
            const isTree = isTreeEdge(link);
            if (!isTree && !settings.showSubLinkLabels) return;
            const label = link.label as string;
            if (!label || globalScale < 0.35) return;
            
            const src = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source);
            const tgt = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target);
            if (!src || !tgt) return;
            if (src.x === undefined || tgt.x === undefined) return;

            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2;

            // Parse text into tokens: { text: string, isBold: boolean }
            const tokens: { text: string; isBold: boolean }[] = [];
            const regex = /\*\*([^*]+)\*\*/g;
            let lastIndex = 0;
            let match;
            while ((match = regex.exec(label)) !== null) {
              if (match.index > lastIndex) {
                tokens.push({ text: label.substring(lastIndex, match.index), isBold: false });
              }
              tokens.push({ text: match[1], isBold: true });
              lastIndex = regex.lastIndex;
            }
            if (lastIndex < label.length) {
              tokens.push({ text: label.substring(lastIndex), isBold: false });
            }

            const baseFont = `'Noto Sans KR', sans-serif`;
            const fs = Math.max(10, 7 / globalScale);
            
            // Calculate total width and individual token widths
            let totalWidth = 0;
            const tokenWidths = tokens.map(t => {
              ctx.font = `${t.isBold ? 'bold' : 'normal'} ${fs}px ${baseFont}`;
              const w = ctx.measureText(t.text).width;
              totalWidth += w;
              return w;
            });

            const pad = 2.5 / globalScale;
            ctx.fillStyle = theme.labelBg;
            ctx.fillRect(midX - totalWidth / 2 - pad, midY - fs / 2 - pad, totalWidth + pad * 2, fs + pad * 2);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.85;

            let currentX = midX - totalWidth / 2;
            tokens.forEach((t, i) => {
              ctx.font = `${t.isBold ? 'bold' : 'normal'} ${fs}px ${baseFont}`;
              ctx.fillStyle = t.isBold ? (activeThemeKey === 'light' ? '#000000' : '#ffffff') : theme.linkLabelText;
              ctx.fillText(t.text, currentX, midY);
              currentX += tokenWidths[i];
            });

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
              const bw = tw + pad * 2;
              const bh = fs + pad * 2;
              const rr = bh / 3.5;

              // ── Dynamic Outward Positioning ──
              // 중심(0,0)으로부터의 각도를 계산하여 레이블을 바깥쪽으로 배치
              const angle = Math.atan2(node.y || 0, node.x || 0);
              const dist = radius + 6 / globalScale;
              const nx = Math.cos(angle);
              const ny = Math.sin(angle);

              // 레이블 상자의 중심 좌표 (lx, ly)
              // 상자 크기를 고려하여 노드와 겹치지 않게 오프셋 조정
              const lx = node.x + nx * (dist + (bw / 2) * Math.abs(nx));
              const ly = node.y + ny * (dist + (bh / 2) * Math.abs(ny));

              const bx = lx - bw / 2;
              const by = ly - bh / 2;

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
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isSelected ? '#fbbf24' : theme.labelText;
              ctx.fillText(label, lx, ly);
            }

            ctx.globalAlpha = 1;
          }}
          nodeCanvasObjectMode={() => 'replace'}
        />
      )}

      {/* 분류 패널 — 실제 프로젝트 분류 목록 + 필터 */}
      <div className="absolute bottom-6 right-6 z-20 select-none flex flex-col items-end gap-3">
        {/* Toggle Button */}
        <button
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md border border-white/10 text-white/70 hover:text-white transition-all bg-black/40"
          title={isFilterExpanded ? "필터 숨기기" : "필터 보이기"}
        >
          {isFilterExpanded ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /></svg>
          )}
        </button>

        {isFilterExpanded && (
          <div
            className="border border-[#2e2e2e] px-4 py-3 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md min-w-[200px] max-w-[260px] animate-in slide-in-from-bottom-2 duration-200"
            style={{ background: `${theme.bg}cc` }}
          >
            <div className="flex items-center justify-between gap-4 mb-3 pb-2 border-b border-white/5">
              <div className="text-[10px] text-[#888] font-bold uppercase tracking-widest">지식 필터</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setHiddenTypes(new Set())}
                  className="text-[9px] text-[#555] hover:text-[#aaa] transition-colors"
                >
                  모두 켜기
                </button>
                <button
                  onClick={() => setHiddenTypes(new Set(colorMap.keys()))}
                  className="text-[9px] text-[#555] hover:text-[#aaa] transition-colors"
                >
                  모두 끄기
                </button>
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto scrollbar-none pl-2 pr-1">
              {/* Types */}
              <div className="space-y-1.5 mb-3.5">
                {(Array.from(colorMap.entries()) as [string, string][])
                  .sort(([a], [b]) => a.localeCompare(b, 'ko'))
                  .map(([type, color]) => {
                    const isHidden = hiddenTypes.has(type);
                    return (
                      <div
                        key={type}
                        onClick={() => {
                          setHiddenTypes(prev => {
                            const next = new Set(prev);
                            if (isHidden) next.delete(type);
                            else next.add(type);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-2.5 cursor-pointer group transition-opacity ${isHidden ? 'opacity-30' : 'opacity-100'}`}
                      >
                        <div className="relative pl-1.5 py-0.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full block flex-shrink-0 transition-transform group-hover:scale-110"
                            style={{ background: color, boxShadow: isHidden ? 'none' : `0 0 8px ${color}` }}
                          />
                        </div>
                        <span className="text-[12px] font-medium flex-1 truncate" style={{ color: theme.labelText }} title={type}>{type}</span>
                        <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${isHidden ? 'border-slate-300 dark:border-[#444] bg-transparent' : 'border-[#a855f7] dark:border-[#a855f7]/60 bg-purple-50/50 dark:bg-[#a855f7]/10'}`}>
                          {!isHidden && <div className="w-1.5 h-1.5 bg-[#a855f7] dark:bg-[#c084fc] rounded-px" />}
                        </div>
                      </div>
                    );
                  })
                }
                {graphData.nodes.length === 0 && (
                  <div className="text-[10px] text-[#444]">노드 없음</div>
                )}
              </div>

              {/* Connections */}
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                <div
                  onClick={() => setShowCoreLinks(!showCoreLinks)}
                  className={`flex items-center gap-2.5 cursor-pointer transition-opacity ${!showCoreLinks ? 'opacity-30' : 'opacity-100'}`}
                >
                  <div className="w-5 h-[2.5px] rounded-full" style={{ background: theme.linkTree }} />
                  <span className="text-[10px] text-[#aaa] flex-1">핵심 연결</span>
                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${!showCoreLinks ? 'border-slate-300 dark:border-[#444] bg-transparent' : 'border-[#a855f7] dark:border-[#a855f7]/60 bg-purple-50/50 dark:bg-[#a855f7]/10'}`}>
                    {showCoreLinks && <div className="w-1.5 h-1.5 bg-[#a855f7] dark:bg-[#c084fc] rounded-px" />}
                  </div>
                </div>
                <div
                  onClick={() => setShowSubLinks(!showSubLinks)}
                  className={`flex items-center gap-2.5 cursor-pointer transition-opacity ${!showSubLinks ? 'opacity-30' : 'opacity-100'}`}
                >
                  <div className="w-5 h-[2px] border-t border-dashed border-[#666]" />
                  <span className="text-[10px] text-[#999] flex-1">부가 연결</span>
                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${!showSubLinks ? 'border-slate-300 dark:border-[#444] bg-transparent' : 'border-[#a855f7] dark:border-[#a855f7]/60 bg-purple-50/50 dark:bg-[#a855f7]/10'}`}>
                    {showSubLinks && <div className="w-1.5 h-1.5 bg-[#a855f7] dark:bg-[#c084fc] rounded-px" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex justify-center w-full">
          <div
            className={`flex flex-col items-center border rounded-xl px-6 py-3.5 backdrop-blur-xl animate-in fade-in duration-300 ${
              activeThemeKey === 'light'
                ? 'border-slate-200/80 shadow-[0_10px_40px_rgba(0,0,0,0.12)]'
                : 'border-[#3e3e3e]/60 shadow-[0_10px_40px_rgba(0,0,0,0.6)]'
            }`}
            style={{
              background: activeThemeKey === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(12,12,12,0.92)',
              color: activeThemeKey === 'light' ? '#0f172a' : '#ffffff',
            }}
          >
            <div className={`text-[10px] font-bold tracking-widest uppercase mb-1.5 ${
              activeThemeKey === 'light' ? 'text-slate-500' : 'text-[#aaa]'
            }`}>관계 정보</div>
            <div className="flex items-center gap-4 text-sm">
              <span className={`font-semibold px-2.5 py-1 rounded-md border ${
                activeThemeKey === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/10'
              }`} style={{ color: theme.labelText }}>
                {hoveredLink.source.name || hoveredLink.source.id}
              </span>
              <div className="flex flex-col items-center text-[#fbbf24]">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded mb-1 ${
                  activeThemeKey === 'light' ? 'bg-[#fbbf24]/15 text-amber-700' : 'bg-[#fbbf24]/10 text-[#fbbf24]'
                }`}>
                  {hoveredLink.label ? (
                    hoveredLink.label.split(/\*\*([^*]+)\*\*/g).map((part: string, idx: number) =>
                      idx % 2 === 1 ? (
                        <strong key={idx} className={`font-extrabold ${activeThemeKey === 'light' ? 'text-slate-900' : 'text-white'}`}>
                          {part}
                        </strong>
                      ) : (
                        part
                      )
                    )
                  ) : '연결됨'}
                </span>
                <svg width="40" height="8" viewBox="0 0 40 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 4H38M38 4L34 1M38 4L34 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className={`font-semibold px-2.5 py-1 rounded-md border ${
                activeThemeKey === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/10'
              }`} style={{ color: theme.labelText }}>
                {hoveredLink.target.name || hoveredLink.target.id}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
