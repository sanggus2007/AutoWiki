"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Edit3, Save, Share2, Trash2, ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";


interface WikiViewerProps {
  slug: string;
  projectId?: string;
  initialTitle: string;
  initialTags: string[];
  initialContent: string;
  categories?: { name: string; slug: string }[];
}

// ── Custom block parsers ──────────────────────────────────────────────────────

/** Extract {{접기|제목|내용}} blocks into a sentinel map */
function extractCollapseBlocks(md: string): { md: string; map: Map<string, { title: string; body: string }> } {
  const map = new Map<string, { title: string; body: string }>();
  let idx = 0;
  const result = md.replace(/\{\{접기\|(.*?)\|([\s\S]*?)\}\}/g, (_, title, body) => {
    const key = `__COLLAPSE_${idx++}__`;
    map.set(key, { title: title.trim(), body: body.trim() });
    return `\n\n${key}\n\n`;
  });
  return { md: result, map };
}

/** Extract > [!TYPE] alert blockquotes into a sentinel map */
function extractAlertBlocks(md: string): { md: string; map: Map<string, { type: string; content: string }> } {
  const map = new Map<string, { type: string; content: string }>();
  let idx = 0;
  // Match: > [!TYPE] followed by zero or more > content lines
  const result = md.replace(
    /> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?((?:> ?[^\n]*\n?)*)/gi,
    (_, type, contentBlock) => {
      const content = contentBlock.replace(/^> ?/gm, '').trim();
      const key = `__ALERT_${idx++}__`;
      map.set(key, { type: type.toUpperCase(), content });
      return `\n\n${key}\n\n`;
    }
  );
  return { md: result, map };
}

/** Parse GitHub-style alert boxes from a blockquote's first child text */
function parseAlertType(text: string): "note" | "tip" | "important" | "warning" | "caution" | null {
  const m = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
  return m ? (m[1].toLowerCase() as any) : null;
}

const ALERT_STYLES: Record<string, { border: string; bg: string; title: string; titleColor: string; icon: string }> = {
  note:      { border: "border-[#3b82f6]", bg: "bg-[#eff6ff] dark:bg-blue-950/20", title: "참고",   titleColor: "text-[#1d4ed8] dark:text-blue-400", icon: "ℹ️" },
  tip:       { border: "border-[#22c55e]", bg: "bg-[#f0fdf4] dark:bg-green-950/20", title: "팁",     titleColor: "text-[#15803d] dark:text-green-400", icon: "💡" },
  important: { border: "border-[#8b5cf6]", bg: "bg-[#f5f3ff] dark:bg-purple-950/20", title: "중요",   titleColor: "text-[#7c3aed] dark:text-purple-400", icon: "⚡" },
  warning:   { border: "border-[#f59e0b]", bg: "bg-[#fffbeb] dark:bg-amber-950/20", title: "주의",   titleColor: "text-[#b45309] dark:text-amber-400", icon: "⚠️" },
  caution:   { border: "border-[#ef4444]", bg: "bg-[#fef2f2] dark:bg-red-950/20", title: "경고",   titleColor: "text-[#b91c1c] dark:text-red-400", icon: "🚫" },
};

function parseWikiSections(md: string) {
  const lines = md.split("\n");

  let infoBoxLines: string[] = [];
  let infoBoxStart = -1, infoBoxEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|") && infoBoxStart === -1) infoBoxStart = i;
    if (infoBoxStart !== -1 && lines[i].trim().startsWith("|")) {
      infoBoxLines.push(lines[i]);
      infoBoxEnd = i;
    } else if (infoBoxStart !== -1 && !lines[i].trim().startsWith("|")) break;
  }

  let tocEntries: { label: string; id: string }[] = [];
  let tocStart = -1, tocEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^##\s*목차/)) { tocStart = i; continue; }
    if (tocStart !== -1 && tocEnd === -1) {
      if (lines[i].trim().startsWith("##")) { tocEnd = i; break; }
      const m = lines[i].trim().match(/^(?:[-*]|\d+\.)\s*(.+)/);
      if (m) {
        let label = m[1].trim();
        label = label.replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Strip markdown links if AI generates them
        const id = label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9가-힣\-]/g, "");
        tocEntries.push({ label, id });
      }
    }
  }
  if (tocStart !== -1 && tocEnd === -1) tocEnd = lines.length;

  const bodyLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i >= infoBoxStart && i <= infoBoxEnd) continue;
    if (tocStart !== -1 && i >= tocStart && i < tocEnd) continue;
    bodyLines.push(lines[i]);
  }

  return { infoBox: infoBoxLines.join("\n"), toc: tocEntries, body: bodyLines.join("\n").trim() };
}

// ── Collapsible section component ─────────────────────────────────────────────
const CollapseBlock: React.FC<{ title: string; body: string; components: any; processLinks: (t: string) => string }> =
  ({ title, body, components, processLinks }) => {
    const [open, setOpen] = useState(false);
    return (
      <div className="my-4 border border-[#a2a9b1] dark:border-zinc-800 rounded-sm overflow-hidden">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-[#f8f9fa] dark:bg-zinc-800 hover:bg-[#eaecf0] dark:hover:bg-zinc-700 transition-colors text-left border-b border-[#a2a9b1] dark:border-zinc-700"
        >
          <span className="font-bold text-[13px] text-[#202122] dark:text-zinc-200">{title}</span>
          {open ? <ChevronDown size={14} className="text-[#54595d] dark:text-gray-400" /> : <ChevronRight size={14} className="text-[#54595d] dark:text-gray-400" />}
        </button>
        {open && (
          <div className="px-4 py-3 text-[14px] text-[#202122] dark:text-gray-300 bg-white dark:bg-zinc-900">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {processLinks(body)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

// ── Main WikiViewer ────────────────────────────────────────────────────────────
export const WikiViewer: React.FC<WikiViewerProps> = ({ slug, projectId, initialTitle, initialTags, initialContent, categories = [] }) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // name → slug map for wiki links that actually exist in DB
  const [validLinkMap, setValidLinkMap] = useState<Record<string, string>>({});

  const [title, setTitle] = useState(initialTitle);
  const [tags, setTags] = useState(initialTags);
  const [selectedCategory, setSelectedCategory] = useState(initialTags[0] || "개념");
  const [isSaving, setIsSaving] = useState(false);
  
  const [docCategories, setDocCategories] = useState<{ name: string; slug: string }[]>(categories || []);
  const [projectTypes, setProjectTypes] = useState<string[]>([]);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    setTags(initialTags);
    setSelectedCategory(initialTags[0] || "개념");
  }, [initialTags]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    setDocCategories(categories || []);
  }, [categories]);

  // Fetch latest data on slug/projectId change to bypass next.js router cache on browser back/forward
  useEffect(() => {
    if (!slug) return;
    const url = projectId ? `/api/wiki/${slug}?project_id=${projectId}` : `/api/wiki/${slug}`;
    apiFetch(url)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch latest wiki content");
      })
      .then(data => {
        setTitle(data.title);
        setTags(data.tags || []);
        setSelectedCategory(data.tags?.[0] || "개념");
        setContent((data.content || "").trim());
        setDocCategories(data.categories || []);
      })
      .catch(err => console.error("[WikiViewer-Refetch] Error updating wiki on mount:", err));
  }, [slug, projectId]);

  // Fetch project entity types (classifications) on mount/projectId change
  useEffect(() => {
    if (projectId) {
      apiFetch(`/api/projects/${projectId}/types`)
        .then(res => {
          if (res.ok) return res.json();
          return [];
        })
        .then(data => setProjectTypes(data))
        .catch(err => console.error("Failed to fetch project types", err));
    }
  }, [projectId]);

  const displayTypes = useMemo(() => {
    const combined = new Set([...projectTypes]);
    if (selectedCategory) {
      combined.add(selectedCategory);
    }
    if (combined.size === 0) {
      return ["개념", "인물", "단체", "장소", "사건", "사물"];
    }
    return Array.from(combined);
  }, [projectTypes, selectedCategory]);

  const parsed = useMemo(() => parseWikiSections(content), [content]);

  // On mount (or when content changes), bulk-resolve all [[링크]] names
  useEffect(() => {
    const names = Array.from(
      new Set(
        [...content.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1].trim())
      )
    );
    if (names.length === 0) { setValidLinkMap({}); return; }
    apiFetch("/api/wiki/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, project_id: projectId }),
    })
      .then((r) => r.json())
      .then((data: Record<string, string>) => setValidLinkMap(data))
      .catch(() => setValidLinkMap({}));
  }, [content]);

  // Replace [[이름]] with a markdown link; actual existence is checked in the `a` renderer
  const processWikiLinks = useCallback((text: string) =>
    text.replace(/\[\[(.*?)\]\]/g, (_, p1) => {
      const label = p1.trim();
      return `[${label}](/dashboard/wiki/__resolve__/${encodeURIComponent(label)})`;
    }), []);

  const handleSave = async () => {
    if (isEditing) {
      setIsSaving(true);
      try {
        const res = await apiFetch(`/api/entities/${slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: title.trim(),
            type: selectedCategory,
            summary: content
          })
        });
        
        if (res.ok) {
          setTags([selectedCategory]);
          setIsEditing(false);
        } else {
          const errText = await res.text();
          alert(`저장에 실패했습니다: ${errText}`);
        }
      } catch (err) {
        console.error("Save error:", err);
        alert("서버에 연결할 수 없습니다.");
      } finally {
        setIsSaving(false);
      }
    } else {
      setIsEditing(true);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/wiki/${slug}`, { method: "DELETE" });
      if (res.ok) router.push("/dashboard");
      else alert("삭제에 실패했습니다.");
    } catch { alert("서버에 연결할 수 없습니다."); }
    finally { setIsDeleting(false); setShowDeleteConfirm(false); }
  };

  // ── Shared markdown components ───────────────────────────────────────────────
  const mdComponents: any = {
    h2: ({ node, children, ...props }: any) => {
      const id = String(children).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9가-힣\-]/g, "");
      return <h2 id={id} className="text-xl font-sans font-bold text-slate-900 dark:text-white mt-7 mb-3 pb-1 border-b border-[#eaecf0] dark:border-gray-800 scroll-mt-4" {...props}>{children}</h2>;
    },
    h3: ({ node, children, ...props }: any) => {
      const id = String(children).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9가-힣\-]/g, "");
      return <h3 id={id} className="text-[17px] font-sans font-bold text-slate-900 dark:text-white mt-5 mb-2 scroll-mt-4" {...props}>{children}</h3>;
    },
    h4: ({ node, children, ...props }: any) => (
      <h4 className="text-[15px] font-sans font-semibold text-[#202122] dark:text-gray-200 mt-4 mb-1.5 scroll-mt-4" {...props}>{children}</h4>
    ),
    p: ({ node, children, ...props }: any) => {
      // Handle collapse sentinel lines
      const text = String(children);
      if (text.match(/^__COLLAPSE_\d+__$/)) {
        return <>{children}</>;
      }
      return <p className="mb-4 leading-relaxed text-[#202122] dark:text-gray-300" {...props}>{children}</p>;
    },
    ul: ({ node, ...props }: any) => <ul className="list-disc list-outside pl-6 mb-4 space-y-1 text-[#202122] dark:text-gray-300" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal list-outside pl-6 mb-4 space-y-1 text-[#202122] dark:text-gray-300" {...props} />,
    li: ({ node, ...props }: any) => <li className="pl-1 leading-relaxed text-[#202122] dark:text-gray-300" {...props} />,
    hr: () => <hr className="my-6 border-0 border-t border-[#eaecf0] dark:border-gray-800" />,
    strong: ({ node, ...props }: any) => <strong className="font-bold text-slate-900 dark:text-white" {...props} />,
    em: ({ node, ...props }: any) => <em className="italic text-[#202122] dark:text-gray-200" {...props} />,
 
    // ── Alert boxes: pre-processed, never hit this blockquote renderer
    // Regular blockquote → styled quote card
    blockquote: ({ node, children, ...props }: any) => (
      <blockquote className="my-5 border-l-4 border-[#0645ad] dark:border-indigo-600 bg-[#f8f9fa] dark:bg-zinc-800 pl-5 pr-4 py-3 text-[#202122] dark:text-zinc-300 italic rounded-sm">
        {children}
        <div className="mt-2 text-[#a2a9b1] dark:text-zinc-600 text-[18px] leading-none select-none text-right">&ldquo;</div>
      </blockquote>
    ),
 
    // ── Code blocks ───────────────────────────────────────────────────────────
    code: ({ node, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      if (!match) {
        return <code className="bg-[#eaecf0] dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 px-1 py-0.5 rounded-sm text-[13px] font-mono border border-[#c8ccd1] dark:border-zinc-700" {...props}>{children}</code>;
      }
      return (
        <div className="my-4 border border-[#c8ccd1] dark:border-zinc-700 rounded-sm overflow-hidden">
          <div className="bg-[#eaecf0] dark:bg-zinc-800 px-3 py-1 text-[11px] font-bold text-[#54595d] dark:text-gray-400 font-mono border-b border-[#c8ccd1] dark:border-zinc-700 flex items-center justify-between">
            <span>{match[1]}</span>
          </div>
          <pre className="p-4 overflow-x-auto text-[13px] font-mono text-slate-700 dark:text-gray-200 bg-[#f8f9fa] dark:bg-gray-900"><code {...props}>{children}</code></pre>
        </div>
      );
    },
 
    // ── Tables ────────────────────────────────────────────────────────────────
    table: ({ node, ...props }: any) => (
      <div className="overflow-x-auto my-5 border border-[#a2a9b1] dark:border-zinc-800 rounded-sm">
        <table className="w-full text-left text-[13px] border-collapse bg-white dark:bg-zinc-950" {...props} />
      </div>
    ),
    th: ({ node, ...props }: any) => <th className="px-3 py-2 border-b border-[#a2a9b1] dark:border-zinc-700 bg-[#eaecf0] dark:bg-zinc-800 font-bold text-[#202122] dark:text-gray-200 whitespace-nowrap" {...props} />,
    td: ({ node, ...props }: any) => <td className="px-3 py-2 border-b border-[#eaecf0] dark:border-zinc-800 text-[#202122] dark:text-gray-300" {...props} />,
    tr: ({ node, ...props }: any) => <tr className="hover:bg-[#f8f9fa] dark:hover:bg-zinc-800/40 transition-colors" {...props} />,
 
    // ── Links ─────────────────────────────────────────────────────────────────
    a: ({ node, href, children, ...props }: any) => {
      if (href?.startsWith("/dashboard/wiki/__resolve__/")) {
        const label = decodeURIComponent(href.replace("/dashboard/wiki/__resolve__/", ""));
        const slug = validLinkMap[label];
 
        // Entity does NOT exist → render as plain text (no hyperlink)
        if (!slug) {
          return <span className="text-[#202122] dark:text-gray-300">{children}</span>;
        }
 
        // Entity exists → clickable wiki link
        return (
          <a
            onClick={(e) => { e.preventDefault(); router.push(`/dashboard/wiki/${slug}${projectId ? `?projectId=${projectId}` : ""}`); }}
            className="text-[#0645ad] dark:text-blue-400 hover:text-[#0b0080] dark:hover:text-blue-300 hover:underline cursor-pointer"
            {...props}
          >
            {children}
          </a>
        );
      }
      return <a href={href} className="text-[#0645ad] dark:text-blue-400 hover:text-[#0b0080] dark:hover:text-blue-300 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />;
    },
 
    // ── Collapse sentinels are rendered as plain text — we intercept in body render
    text: ({ children }: any) => {
      if (String(children).match(/^__COLLAPSE_\d+__$/)) return null;
      return <>{children}</>;
    },
  };
 
  // ── Body renderer with alert + collapse block injection ──────────────────────
  const renderBody = (rawBody: string) => {
    const { md: noCollapses, map: collapseMap } = extractCollapseBlocks(rawBody);
    const { md: noAlerts,   map: alertMap }     = extractAlertBlocks(noCollapses);
    const withLinks = processWikiLinks(noAlerts);
 
    // Split on all sentinels
    const parts = withLinks.split(/(__COLLAPSE_\d+__|__ALERT_\d+__)/);
    return parts.map((part, i) => {
      // Collapse block
      if (collapseMap.has(part)) {
        const { title, body } = collapseMap.get(part)!;
        return <CollapseBlock key={i} title={title} body={body} components={mdComponents} processLinks={processWikiLinks} />;
      }
      // Alert block
      if (alertMap.has(part)) {
        const { type, content } = alertMap.get(part)!;
        const s = ALERT_STYLES[type.toLowerCase()];
        if (!s) return null;
        return (
          <div key={i} className={`my-5 border-l-4 ${s.border} ${s.bg} rounded-sm overflow-hidden`}>
            <div className={`px-4 py-2 font-bold text-[12px] ${s.titleColor} flex items-center gap-1.5 border-b border-black/5`}>
              <span>{s.icon}</span>{s.title}
            </div>
            <div className="px-4 py-3 text-[13px] text-[#202122] dark:text-gray-300 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {processWikiLinks(content)}
              </ReactMarkdown>
            </div>
          </div>
        );
      }
      // Regular markdown
      if (!part.trim()) return null;
      return (
        <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>
          {part}
        </ReactMarkdown>
      );
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 pb-32 font-sans bg-white dark:bg-zinc-900 min-h-screen border-x border-[#a2a9b1] dark:border-zinc-800 select-text">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#0645ad] dark:text-blue-400 hover:underline text-[13px] flex items-center">
          <ArrowLeft size={14} className="mr-1" /> 뒤로 가기
        </button>
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <button 
            onClick={() => setShowDeleteConfirm(true)} 
            className="flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 rounded-sm font-bold text-[13px] border border-[#c8ccd1] dark:border-red-900/50 bg-[#fff3f3] dark:bg-red-950/20 text-[#cc0000] dark:text-red-450 hover:bg-[#fee7e6] dark:hover:bg-red-950/40"
            title="삭제"
          >
            <Trash2 size={14} className="sm:mr-1.5" />
            <span className="hidden sm:inline">삭제</span>
          </button>
          <button className="p-1.5 rounded-sm bg-[#f8f9fa] dark:bg-zinc-800 text-[#54595d] dark:text-gray-400 hover:bg-[#eaecf0] dark:hover:bg-zinc-700 border border-[#a2a9b1] dark:border-zinc-700" title="공유">
            <Share2 size={14} />
          </button>
          <div className="border-l border-[#a2a9b1] dark:border-zinc-700 h-4 mx-0.5 sm:mx-1" />
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 rounded-sm font-bold text-[13px] border ${isEditing ? "bg-[#0645ad] dark:bg-indigo-600 text-white border-[#0645ad] dark:border-indigo-600 hover:bg-[#0b0080] dark:hover:bg-indigo-700" : "bg-[#f8f9fa] dark:bg-zinc-800 text-[#202122] dark:text-zinc-300 border-[#a2a9b1] dark:border-zinc-700 hover:bg-[#eaecf0] dark:hover:bg-zinc-700"} disabled:opacity-50`}
            title={isEditing ? "변경사항 저장" : "편집"}
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin sm:mr-1.5" />
                <span className="hidden sm:inline">저장 중...</span>
              </>
            ) : isEditing ? (
              <>
                <Save size={14} className="sm:mr-1.5" />
                <span className="hidden sm:inline">변경사항 저장</span>
              </>
            ) : (
              <>
                <Edit3 size={14} className="sm:mr-1.5" />
                <span className="hidden sm:inline">편집</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-zinc-800 border border-[#a2a9b1] dark:border-zinc-700 shadow-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#000000] dark:text-white mb-2 font-serif">문서 삭제 확인</h3>
            <p className="text-[14px] text-[#202122] dark:text-gray-200 mb-1"><strong>「{title}」</strong> 문서를 정말 삭제하시겠습니까?</p>
            <p className="text-[12px] text-[#54595d] dark:text-gray-400 mb-5">이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 text-[13px] border border-[#a2a9b1] dark:border-gray-700 bg-[#f8f9fa] dark:bg-gray-800 text-[#202122] dark:text-gray-300 hover:bg-[#eaecf0] dark:hover:bg-gray-700 font-bold">취소</button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-1.5 text-[13px] border border-[#cc0000] bg-[#cc0000] text-white hover:bg-[#aa0000] font-bold disabled:opacity-50">{isDeleting ? "삭제 중..." : "삭제 실행"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="mb-6 border-b border-[#a2a9b1] dark:border-gray-800 pb-4">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#54595d] dark:text-gray-400 uppercase tracking-wider mb-1.5">
                문서 제목
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xl font-serif px-3 py-2 bg-white dark:bg-zinc-950 border border-[#a2a9b1] dark:border-zinc-800 rounded-sm text-[#000000] dark:text-white focus:outline-none focus:border-[#0645ad] dark:focus:border-indigo-500 shadow-inner"
                placeholder="문서 제목을 입력하세요..."
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-[#54595d] dark:text-gray-400 uppercase tracking-wider mb-1.5">
                분류
              </label>
              <div className="relative inline-block w-48">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 bg-[#f8f9fa] dark:bg-zinc-800 border border-[#a2a9b1] dark:border-zinc-700 rounded-sm text-[#202122] dark:text-zinc-200 font-bold focus:outline-none cursor-pointer appearance-none"
                >
                  {displayTypes.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-[#54595d] dark:text-gray-400">
                  <ChevronDown size={14} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-serif text-[#000000] dark:text-white mb-1 leading-tight">{title}</h1>
            <div className="flex items-center text-[12px] text-[#54595d] dark:text-gray-400">
                  분류:
              {tags.map(tag => <span key={tag} className="ml-1 text-[#0645ad] dark:text-blue-400 hover:underline cursor-pointer">{tag}</span>)}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {isEditing ? (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full min-h-[600px] bg-white dark:bg-gray-900 text-[#000000] dark:text-gray-100 border border-[#a2a9b1] dark:border-gray-800 p-3 font-mono text-[13px] focus:outline-none focus:border-[#0645ad] dark:focus:border-indigo-500 resize-y shadow-inner"
          placeholder="마크다운 소스를 입력하세요..."
        />
      ) : (
        <>
          {/* ToC + Info-box grid */}
          {(parsed.toc.length > 0 || parsed.infoBox) && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 mb-6">
              <div className="border border-[#a2a9b1] dark:border-zinc-800 bg-[#f8f9fa] dark:bg-zinc-800/50 p-4 self-start">
                <div className="font-bold text-[14px] border-b border-[#a2a9b1] dark:border-zinc-700 pb-1 mb-2 text-slate-800 dark:text-slate-100">목차</div>
                <ol className="list-decimal list-inside text-[13px] space-y-1 text-slate-700 dark:text-gray-300">
                  {parsed.toc.map((entry, i) => (
                    <li key={i}>
                      <a
                        href={`#${entry.id}`}
                        className="text-[#0645ad] dark:text-blue-400 hover:underline hover:text-[#0b0080] dark:hover:text-blue-300"
                        onClick={e => { e.preventDefault(); document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth" }); }}
                      >
                        {entry.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
              {parsed.infoBox && (
                <div className="border border-[#a2a9b1] dark:border-zinc-800 bg-[#f8f9fa] dark:bg-zinc-800/50 self-start">
                  <div className="bg-[#eaecf0] dark:bg-zinc-800 border-b border-[#a2a9b1] dark:border-zinc-700 px-3 py-1.5 font-bold text-[13px] text-center text-[#202122] dark:text-white">{title}</div>
                  <div className="text-[13px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                      ...mdComponents,
                      table: ({ node, ...props }: any) => <table className="w-full text-[13px] border-collapse" {...props} />,
                      th: ({ node, ...props }: any) => <th className="px-2 py-1.5 border-b border-[#c8ccd1] dark:border-zinc-700 bg-[#eaecf0] dark:bg-zinc-800 text-left font-bold text-[#202122] dark:text-[#eaecf0] text-[12px]" {...props} />,
                      td: ({ node, ...props }: any) => <td className="px-2 py-1.5 border-b border-[#eaecf0] dark:border-zinc-800 text-[#202122] dark:text-gray-300 text-[12px]" {...props} />,
                    }}>{processWikiLinks(parsed.infoBox)}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="markdown-body select-text max-w-none break-words text-[14.2px] leading-relaxed text-[#202122] dark:text-zinc-200 space-y-0">
            {renderBody(parsed.body)}
          </div>
        </>
      )}

      {/* Categories */}
      {docCategories.length > 0 && (
        <div className="mt-12 pt-4 border-t border-[#a2a9b1] dark:border-zinc-800">
          <div className="bg-[#f8f9fa] dark:bg-zinc-800/40 border border-[#a2a9b1] dark:border-zinc-800 p-3 text-[12px] text-slate-800 dark:text-gray-300">
            <span className="font-bold mr-2">카테고리:</span>
            {docCategories.map((c, i) => (
              <React.Fragment key={c.slug}>
                {i > 0 && <span className="text-[#54595d] dark:text-gray-600 mx-1">|</span>}
                <span>{c.name}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 pt-6 border-t border-[#a2a9b1] dark:border-zinc-800 flex justify-between text-[11px] text-[#54595d] dark:text-gray-400">
        <span>이 문서는 자유 라이선스 아래 배포됩니다.</span>
        <span>개인정보처리방침 • AutoWiki AI 소개 • 면책 조항</span>
      </div>
    </div>
  );
};
