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
  const user = useAuthStore(state => state.user);
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [user, router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (!user) return null;

  return (
    <div className="fixed inset-0 flex bg-[#f8f9fa] dark:bg-[#111827] text-[#202122] dark:text-[#f3f4f6] overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-[#121212] pb-[env(safe-area-inset-bottom)] transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
