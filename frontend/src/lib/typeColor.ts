/**
 * 황금각(137.508°) 기반 HSL 색상 배정
 * 전체 타입 목록을 받아 서로 최대한 다른 색을 배정합니다.
 * 어떤 수의 분류가 들어와도 겹치지 않습니다.
 */

// ─── HSL → HEX 변환 ─────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ─── 단일 타입 폴백용 해시 ──────────────────────────────────────────────────

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

// ─── 기본 회색 (미분류 / 빈 타입) ──────────────────────────────────────────

export const TYPE_COLOR_NONE = '#94a3b8';

// ─── 핵심: 전체 타입 목록 기반 최적 색상 배정 ───────────────────────────────
//
// 황금각 배정 원리:
//   - 황금비 φ = 1.618...에서 derived된 각도 137.508°를 사용
//   - 색상환(0°~360°)에서 이 각도씩 이동하면
//     어떤 n개의 점도 최대로 균등하게 분산됨
//   - index 0, 1, 2, 3...일수록 겹침 없이 새 hue 공간을 사용

const GOLDEN_ANGLE = 137.508; // degrees
const BASE_HUE     = 220;     // 시작 hue (파랑 계열이 자연스러운 시작점)
const SATURATION   = 68;      // %
const LIGHTNESS    = 58;      // % — 너무 밝지도 어둡지도 않은 선명한 색

/**
 * 타입 이름 배열을 받아 Map<type, hexColor>을 반환합니다.
 * 동일한 타입 집합이면 항상 동일한 색상이 배정됩니다 (정렬 기준 고정).
 */
export function assignTypeColors(types: string[]): Map<string, string> {
  const unique = [...new Set(types.filter(t => t && t.trim()))]
    .map(t => t.trim())
    .sort((a, b) => a.localeCompare(b, 'ko'));

  const colorMap = new Map<string, string>();
  unique.forEach((type, index) => {
    const hue = (BASE_HUE + index * GOLDEN_ANGLE) % 360;
    colorMap.set(type, hslToHex(hue, SATURATION, LIGHTNESS));
  });
  return colorMap;
}

/**
 * 단일 타입 → 색상 변환 (colorMap 없이 호출 시 해시 폴백 사용).
 * 가능하면 assignTypeColors로 생성된 Map을 전달하세요.
 */
export function typeToColor(type: string, colorMap?: Map<string, string>): string {
  if (!type?.trim()) return TYPE_COLOR_NONE;
  if (colorMap) return colorMap.get(type.trim()) ?? TYPE_COLOR_NONE;
  // 폴백: 해시 기반 hue (colorMap 없을 때)
  const hue = (BASE_HUE + hashString(type.trim()) * GOLDEN_ANGLE) % 360;
  return hslToHex(hue, SATURATION, LIGHTNESS);
}
