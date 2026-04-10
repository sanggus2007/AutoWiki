"use client";
import { Sidebar, Header } from "@/components/Shell";
import { useAuthStore } from "@/lib/store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useAuthStore(state => state.token);
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [token, router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (!token) return null;

  return (
    <div className="flex h-[100dvh] bg-[#f8f9fa] text-[#202122] overflow-hidden relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
