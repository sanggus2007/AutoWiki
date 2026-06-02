"use client";
import { Sidebar, Header } from "@/components/Shell";
import { useAuthStore } from "@/lib/store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check } from "lucide-react";

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

  const showFloatingButton = activeProcess && 
    (activeProcess.status === "RUNNING" || activeProcess.status === "SUCCESS") && 
    !pathname.includes("/upload");

  return (
    <div className="fixed inset-0 flex bg-[#f8f9fa] dark:bg-[#111827] text-[#202122] dark:text-[#f3f4f6] overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-[#121212] pb-[env(safe-area-inset-bottom)] transition-colors duration-200">
          {children}
        </main>
      </div>

      <AnimatePresence>
        {showFloatingButton && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push(`/dashboard/project/${activeProcess.projectId}/upload`)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-[#0645ad]/95 dark:bg-zinc-800/95 text-white dark:text-white rounded-full shadow-2xl cursor-pointer hover:bg-[#0b0080] dark:hover:bg-zinc-700 transition-colors border border-[#0645ad]/10 dark:border-zinc-700 backdrop-blur-sm"
          >
            <div className="relative flex items-center justify-center shrink-0">
              {activeProcess.status === "RUNNING" ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <div className="absolute inset-0 animate-ping rounded-full bg-white/20" />
                </>
              ) : (
                <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check size={12} className="text-white font-bold" />
                </div>
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[12px] font-bold tracking-tight whitespace-nowrap">
                {activeProcess.status === "RUNNING" ? (
                  activeProcess.type === "INGEST" ? "AI 기획 분석 중..." : "AI 위키 작성 중..."
                ) : (
                  activeProcess.type === "INGEST" ? "AI 기획 완료! 🎉" : "AI 위키 작성 완료!"
                )}
              </span>
              <span className="text-[9px] opacity-80 leading-none mt-0.5 font-medium whitespace-nowrap">
                {activeProcess.status === "RUNNING" ? "클릭하여 진행 상황 보기" : "클릭하여 결과 검토하기"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
