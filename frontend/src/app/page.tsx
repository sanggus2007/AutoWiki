"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9fa] font-sans text-[#202122]">
      <p>대시보드로 이동 중...</p>
    </main>
  );
}
