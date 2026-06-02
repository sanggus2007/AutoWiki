"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  Upload,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";


interface Project {
  id: number;
  name: string;
  slug: string;
}

interface ExportImportPanelProps {
  onClose: () => void;
}

type ToastType = "success" | "error";
interface Toast {
  type: ToastType;
  message: string;
}

export default function ExportImportPanel({ onClose }: ExportImportPanelProps) {
  const router = useRouter();

  // ── shared state ────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);

  // ── export state ────────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [exportLoading, setExportLoading] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(true);

  // ── import state ────────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"new" | "overwrite">("new");
  const [importLoading, setImportLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
        if (data.length > 0) setSelectedProjectId(data[0].id);
      })
      .catch(console.error);
  }, []);

  const showToast = (type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!selectedProjectId) return;
    setExportLoading(true);
    try {
      const res = await apiFetch(
        `/api/projects/${selectedProjectId}/export?include_files=${includeFiles}`
      );
      if (!res.ok) throw new Error("export failed");

      // Build filename client-side using the project name (handles Korean/Unicode natively)
      const project = projects.find((p) => p.id === selectedProjectId);
      const projectName = project?.name ?? `project-${selectedProjectId}`;
      const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      // Strip characters that are unsafe in filenames on Windows/macOS
      const safeName = projectName.replace(/[\\/:*?"<>|]/g, "").trim() || `project-${selectedProjectId}`;
      const filename = `${safeName}_${dateStr}.autowiki`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      showToast("success", `「${filename}」 파일로 내보냈습니다!`);
    } catch {
      showToast("error", "내보내기 중 오류가 발생했습니다.");
    } finally {
      setExportLoading(false);
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setImportFile(dropped);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const res = await apiFetch(
        `/api/import?overwrite=${importMode === "overwrite"}`,
        { method: "POST", body: formData }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "import failed");
      }

      const result = await res.json();
      const modeLabel = result.overwritten ? "덮어쓰기" : "새 프로젝트 생성";
      showToast(
        "success",
        `「${result.project_name}」 복원 완료! (${modeLabel}, 개체 ${result.entities_imported}건, 파일 ${result.files_imported}건)`
      );
      setImportFile(null);

      // Navigate to the restored project after a short delay
      setTimeout(() => {
        router.push(`/dashboard/project/${result.project_id}`);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "가져오기 중 오류가 발생했습니다.";
      showToast("error", msg);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 shadow-2xl w-full max-w-lg rounded-sm my-auto max-h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-[#eaecf0] dark:bg-zinc-800 border-b border-[#a2a9b1] dark:border-zinc-700 px-5 py-3 flex items-center justify-between shrink-0">
          <h2 className="font-serif font-bold text-[#202122] dark:text-white text-lg">
            내보내기 / 가져오기
          </h2>
          <button
            onClick={onClose}
            className="text-[#54595d] dark:text-gray-400 hover:text-[#202122] dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* ── Export Section ── */}
          <section>
            <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-[#eaecf0] dark:border-zinc-800">
              <Download size={16} className="text-[#0645ad] dark:text-blue-400" />
              <h3 className="font-bold text-[14px] text-[#202122] dark:text-white">내보내기</h3>
              <span className="text-[11px] text-[#54595d] dark:text-gray-400">
                — 프로젝트를 .autowiki 파일로 백업
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-bold text-[#54595d] dark:text-gray-400 mb-1">
                  프로젝트 선택
                </label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) =>
                      setSelectedProjectId(Number(e.target.value))
                    }
                    className="w-full border border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] px-3 py-2 text-[13px] focus:outline-none focus:border-[#0645ad] dark:focus:border-blue-400 appearance-none pr-8"
                  >
                    {projects.length === 0 && (
                      <option value="">프로젝트 없음</option>
                    )}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#54595d] dark:text-gray-400 pointer-events-none"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2 px-1">
                <input
                  type="checkbox"
                  id="includeFiles"
                  checked={includeFiles}
                  onChange={(e) => setIncludeFiles(e.target.checked)}
                  className="w-4 h-4 text-[#0645ad] dark:text-blue-400 accent-[#0645ad] dark:accent-blue-400 border-[#a2a9b1] dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-sm focus:ring-0 cursor-pointer"
                />
                <label htmlFor="includeFiles" className="text-[12px] text-[#202122] dark:text-[#eaecf0] cursor-pointer">
                  사용자 첨부 파일 포함 (원본 .txt 등)
                </label>
              </div>

              <button
                onClick={handleExport}
                disabled={!selectedProjectId || exportLoading}
                className="flex items-center justify-center space-x-2 w-full px-4 py-2 bg-[#0645ad] dark:bg-blue-600 text-white text-[13px] font-bold hover:bg-[#0b0080] dark:hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exportLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                <span>{exportLoading ? "내보내는 중..." : "파일로 내보내기"}</span>
              </button>
            </div>
          </section>

          {/* ── Divider ── */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#eaecf0] dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white dark:bg-zinc-900 px-3 text-[#54595d] dark:text-gray-400 uppercase tracking-wider font-bold">
                또는
              </span>
            </div>
          </div>

          {/* ── Import Section ── */}
          <section>
            <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-[#eaecf0] dark:border-zinc-800">
              <Upload size={16} className="text-[#0645ad] dark:text-blue-400" />
              <h3 className="font-bold text-[14px] text-[#202122] dark:text-white">가져오기</h3>
              <span className="text-[11px] text-[#54595d] dark:text-gray-400">
                — .autowiki 파일로 복원
              </span>
            </div>

            <div className="space-y-3">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-sm p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-[#0645ad] dark:border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                    : importFile
                    ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                    : "border-[#a2a9b1] dark:border-zinc-700 hover:border-[#0645ad] dark:hover:border-blue-400 hover:bg-[#f8f9fa] dark:hover:bg-zinc-800"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".autowiki,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setImportFile(f);
                  }}
                />
                {importFile ? (
                  <div className="flex items-center justify-center space-x-2 text-emerald-700 dark:text-emerald-400">
                    <FolderOpen size={18} />
                    <span className="text-[13px] font-bold truncate max-w-xs">
                      {importFile.name}
                    </span>
                  </div>
                ) : (
                  <div className="text-[#54595d] dark:text-gray-400">
                    <Upload
                      size={24}
                      className="mx-auto mb-2 text-[#a2a9b1] dark:text-zinc-500"
                    />
                    <p className="text-[13px] font-bold">
                      파일을 드래그하거나 클릭하여 선택
                    </p>
                    <p className="text-[11px] mt-1">.autowiki 파일만 지원</p>
                  </div>
                )}
              </div>

              {/* Import Mode */}
              <div>
                <label className="block text-[12px] font-bold text-[#54595d] dark:text-gray-400 mb-1.5">
                  가져오기 방식
                </label>
                <div className="flex space-x-3">
                  {(
                    [
                      { value: "new", label: "새 프로젝트로 생성" },
                      { value: "overwrite", label: "기존 프로젝트 덮어쓰기" },
                    ] as const
                  ).map(({ value, label }) => (
                    <label
                      key={value}
                      className={`flex-1 flex items-center justify-center space-x-2 border py-2 px-3 cursor-pointer text-[12px] font-bold transition-all ${
                        importMode === value
                          ? "border-[#0645ad] dark:border-blue-400 bg-[#eaf0fb] dark:bg-blue-950/20 text-[#0645ad] dark:text-blue-400"
                          : "border-[#a2a9b1] dark:border-zinc-700 text-[#54595d] dark:text-gray-400 hover:bg-[#f8f9fa] dark:hover:bg-zinc-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value={value}
                        checked={importMode === value}
                        onChange={() => setImportMode(value)}
                        className="hidden"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {importMode === "overwrite" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-1.5 rounded-sm">
                    ⚠ 같은 slug의 기존 프로젝트 데이터가 모두 삭제되고 파일 내용으로 교체됩니다.
                  </p>
                )}
              </div>

              <button
                onClick={handleImport}
                disabled={!importFile || importLoading}
                className="flex items-center justify-center space-x-2 w-full px-4 py-2 bg-[#3b82f6] dark:bg-blue-600 text-white text-[13px] font-bold hover:bg-[#2563eb] dark:hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Upload size={15} />
                )}
                <span>{importLoading ? "복원 중..." : "가져오기 시작"}</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 px-5 py-3 rounded-sm shadow-xl text-white text-[13px] font-bold z-[60] transition-all ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
