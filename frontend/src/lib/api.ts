import { useAuthStore } from "./store";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const { token, logout } = useAuthStore.getState();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let url = input;
  if (typeof input === "string" && (input.startsWith("/") || input.startsWith("api/"))) {
    const splash = input.startsWith("/") ? "" : "/";
    url = `${API_BASE_URL}${splash}${input}`;
  }

  try {
    const res = await fetch(url, { ...init, headers });
    
    // 401 처리는 각 컴포넌트나 호출부에서 에러 메시지에 따라 개별 처리하도록 변경 (GitHub 토큰 만료와 서비스 로그아웃 구분 목적)
    return res;
  } catch (err) {
    throw err;
  }
}

