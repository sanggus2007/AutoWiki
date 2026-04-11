import { useAuthStore } from "./store";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const { logout } = useAuthStore.getState();
  const headers = new Headers(init?.headers);
  
  // CSRF Protection: Custom header to prevent generic form submissions
  headers.set("X-CSRF-Token", "autowiki-session-v3");

  let url = input;
  if (typeof input === "string" && (input.startsWith("/") || input.startsWith("api/"))) {
    const splash = input.startsWith("/") ? "" : "/";
    url = `${API_BASE_URL}${splash}${input}`;
  }

  try {
    const res = await fetch(url, { 
      ...init, 
      headers,
      credentials: "include" // Important for sending cookies
    });
    
    // 401 처리: 세션 만료 시 로그인 페이지로 리다이렉트
    if (res.status === 401) {
      const clone = res.clone();
      const text = await clone.text();
      // Don't auto-redirect if it's just a GitHub token issue
      if (!text.toLowerCase().includes("github") && !text.toLowerCase().includes("copilot")) {
        logout();
        if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
           window.location.href = "/login";
        }
      }
    }
    
    return res;
  } catch (err) {
    throw err;
  }
}

