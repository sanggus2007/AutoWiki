"use client";
import { AuthOverlay } from "@/components/AuthOverlay";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { useAuthStore } from "@/lib/store";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setUser } = useAuthStore();

  useEffect(() => {
    // 1. Check for legacy URL tokens (for Google OAuth migration)
    const urlToken = searchParams.get("token");
    if (urlToken) {
       // We ignore tokens in URL now for security, just tell user to refresh or use cookie
       router.replace("/login?auth=success");
       return;
    }

    // 2. Handle successful session-based login (Cookie or sid fallback)
    const authStatus = searchParams.get("auth");
    const sid = searchParams.get("sid");
    
    if (authStatus === "success") {
      if (sid) {
        localStorage.setItem("autowiki_sid", sid);
        console.log("[Auth] Captured session ID from URL fallback");
      }
      
      // Re-fetch user to hydrate store
      import("@/lib/api").then(async ({ apiFetch }) => {
        const res = await apiFetch("/api/users/me");
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          router.replace("/dashboard");
        } else {
          console.error("[Login] Failed to fetch user after login success");
        }
      });
      return;
    }

    // 3. Already logged in?
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router, searchParams, setUser]);

  if (user) return null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
      <AuthOverlay onSuccess={() => router.replace("/dashboard")} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
