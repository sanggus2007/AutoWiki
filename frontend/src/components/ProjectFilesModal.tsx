"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Trash2, Upload, FileText, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ProjectFile {
  id: number;
  filename: string;
  upload_date: string;
  size: number;
  is_selected: boolean;
}

interface ProjectFilesModalProps {
  projectId: string;
  onClose: () => void;
}

export function ProjectFilesModal({ projectId, onClose }: ProjectFilesModalProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/files`);
      if (res.ok) {
        setFiles(await res.json());
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (const f of Array.from(e.target.files)) {
      formData.append("files", f);
    }
    
    try {
      const res = await apiFetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        await loadFiles();
      } else {
         const errText = await res.text();
         alert("파일 업로드 실패: " + errText);
      }
    } catch(err) {
      console.error(err);
      alert("업로드 중 오류 발생");
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleDelete = async (fileId: number) => {
    if (!confirm("정말 이 참고 파일을 삭제하시겠습니까?")) return;
    try {
      const res = await apiFetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setFiles(prev => prev.filter(f => f.id !== fileId));
      } else {
        alert("삭제 실패");
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleToggle = async (fileId: number, currentSelected: boolean) => {
    // Optimistic update
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, is_selected: !currentSelected } : f));
    try {
      const res = await apiFetch(`/api/projects/${projectId}/files/${fileId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_selected: !currentSelected })
      });
      if (!res.ok) {
        // Revert on failure
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, is_selected: currentSelected } : f));
      }
    } catch(err) {
      console.error(err);
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, is_selected: currentSelected } : f));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-zinc-900 border border-[#a2a9b1] dark:border-zinc-800 rounded shadow-lg w-full max-w-2xl flex flex-col max-h-[85vh] font-sans">
        <div className="flex justify-between items-center p-4 border-b border-[#a2a9b1] dark:border-zinc-800">
          <h2 className="text-xl font-serif font-bold text-[#202122] dark:text-white">프로젝트 참고 파일 관리</h2>
          <button onClick={onClose} className="text-[#54595d] dark:text-gray-400 hover:text-black dark:hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-sm text-[#54595d] dark:text-gray-400 mb-4">
            이곳에 업로드된 파일들은 지식 구조도로 즉시 추출되지 않고 원본 파일로 저장됩니다.<br/>
            이후 AI 채팅이나 문서 추가 시 문맥으로 활용할 수 있습니다.
          </p>

          <div className="mb-4">
            <input
              type="file"
              multiple
              accept=".txt,.pdf,.csv,.docx"
              id="project-file-upload"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <label
              htmlFor="project-file-upload"
              className={`flex items-center justify-center w-full py-2 px-4 border border-[#0645ad] dark:border-blue-600 rounded text-[#0645ad] dark:text-blue-400 font-bold text-sm transition cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : 'hover:bg-[#eef1ff] dark:hover:bg-blue-950/20'}`}
            >
              {uploading ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> 업로드 중...</>
              ) : (
                <><Upload size={16} className="mr-2" /> 새 참고 파일 추가</>
              )}
            </label>
          </div>

          <div className="bg-[#f8f9fa] dark:bg-zinc-900 border border-[#eaecf0] dark:border-zinc-800 rounded-sm relative">
            {loading ? (
              <div className="py-8 text-center text-[#54595d] dark:text-gray-400">
                <Loader2 size={24} className="mx-auto animate-spin mb-2" />
                목록을 불러오는 중...
              </div>
            ) : files.length === 0 ? (
              <div className="py-8 text-center text-[#54595d] dark:text-gray-400 text-sm">
                등록된 참고 파일이 없습니다.
              </div>
            ) : (
              <ul>
                {files.map(f => (
                  <li key={f.id} className="flex items-center justify-between p-3 border-b border-[#eaecf0] dark:border-zinc-800 last:border-b-0 hover:bg-white dark:hover:bg-zinc-800 transition-colors">
                    <div className="flex items-center flex-1 min-w-0 mr-4">
                      <input 
                        type="checkbox" 
                        className="mr-4 w-4 h-4 cursor-pointer accent-[#0645ad] dark:accent-blue-400"
                        checked={f.is_selected} 
                        onChange={() => handleToggle(f.id, f.is_selected)} 
                      />
                      <FileText size={16} className="text-[#0645ad] dark:text-blue-400 mr-3 shrink-0" />
                      <div className="flex flex-col min-w-0 overflow-hidden">
                        <span className="text-[#202122] dark:text-[#eaecf0] font-semibold text-sm truncate">{f.filename}</span>
                        <span className="text-[#54595d] dark:text-gray-400 text-[11px] mt-0.5">
                          {(f.size / 1024).toFixed(1)} KB • {new Date(f.upload_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(f.id)}
                      className="text-[#54595d] dark:text-gray-400 hover:text-[#cc0000] dark:hover:text-red-400 p-1.5 transition-colors rounded hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#eaecf0] dark:border-zinc-800 flex justify-end bg-gray-50 dark:bg-zinc-900">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#a2a9b1] dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-[#202122] dark:text-[#eaecf0] font-bold text-sm hover:bg-gray-100 dark:hover:bg-zinc-700 transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
