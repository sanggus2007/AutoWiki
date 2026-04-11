"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { apiFetch } from "@/lib/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // 1. Legacy Token Cleanup
    // Remove token from localStorage if it exists from previous version
    try {
      const legacyStorage = localStorage.getItem("autowiki-auth-storage");
      if (legacyStorage) {
        console.log("[Auth] Cleaning up legacy localStorage tokens...");
        localStorage.removeItem("autowiki-auth-storage");
      }
    } catch (e) {
      // Ignore errors in environments where localStorage is not available
    }

    // 2. Initial Auth Hydration
    const initAuth = async () => {
      try {
        const res = await apiFetch("/api/users/me");
        if (res.ok) {
          const user = await res.json();
          setUser(user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("[Auth] Hydration failed:", err);
        setUser(null);
      } finally {
        setHydrated(true);
      }
    };

    initAuth();
  }, [setUser]);

  // Optionally show a global loader until the first auth check finishes
  // For now, we'll just render children to avoid white screen on first load
  return <>{children}</>;
}
