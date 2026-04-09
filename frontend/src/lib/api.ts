import { useAuthStore } from "./store";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let url = input;
  if (typeof input === "string" && (input.startsWith("/") || input.startsWith("api/"))) {
    const splash = input.startsWith("/") ? "" : "/";
    url = `${API_BASE_URL}${splash}${input}`;
  }

  // If using Next.js App Router server components, useAuthStore.getState() is not available
  // But this `apiFetch` is primarily for Client Components.
  return fetch(url, { ...init, headers });
}

