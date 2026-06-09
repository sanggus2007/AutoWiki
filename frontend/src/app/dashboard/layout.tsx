"use client";
import { Sidebar, Header } from "@/components/Shell";
import { useAuthStore } from "@/lib/store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check } from "lucide-react";

import { BackgroundProcessManager } from "@/components/BackgroundProcessManager";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore(state => state.user);
  const activeProcess = useAuthStore(state => state.activeProcess);
  const router = useRouter();
  const pathname = usePathname();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
    <div className="w-full h-[100dvh] flex bg-white dark:bg-[#121212] text-[#202122] dark:text-[#f3f4f6] overflow-hidden">
      <BackgroundProcessManager />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-white dark:bg-[#121212] transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
