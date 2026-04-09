"use client";
import { AuthOverlay } from "@/components/AuthOverlay";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    if (token) {
      router.replace("/dashboard");
    }
  }, [token, router]);

  if (token) return null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
      <AuthOverlay onSuccess={() => router.replace("/dashboard")} />
    </div>
  );
}
