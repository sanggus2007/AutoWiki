"use client";
import { AuthOverlay } from "@/components/AuthOverlay";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { useAuthStore } from "@/lib/store";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, setAuth } = useAuthStore();

  useEffect(() => {
    // Google OAuth 콜백에서 전달된 token 처리
    const urlToken = searchParams.get("token");
    const username = searchParams.get("username");
    const userId = searchParams.get("user_id");
    const avatar = searchParams.get("avatar");
    if (urlToken && username && userId) {
      setAuth(urlToken, { id: parseInt(userId), username, avatar_url: avatar || "" });
      router.replace("/dashboard");
      return;
    }
    if (token) {
      router.replace("/dashboard");
    }
  }, [token, router, searchParams, setAuth]);

  if (token) return null;

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
