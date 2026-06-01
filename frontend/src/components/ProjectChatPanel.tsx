"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, MessageSquare, Loader2, Bot, User, Plus, Trash2 } from "lucide-react";
import { TextInputUI } from "./TextInputUI";
import { AuthOverlay } from "./AuthOverlay";
import { apiFetch } from "@/lib/api";
import { SetupTutorial } from "@/components/SetupTutorial";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

function is401(status: number, body: string) {
  return (
    status === 401 ||
    body.toLowerCase().includes("token expired") ||
    body.toLowerCase().includes("unauthorized")
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: number;
  title: string;
  updated_date: string;
}

interface ProjectChatPanelProps {
  projectId: string;
  onClose: () => void;
}

export const ProjectChatPanel: React.FC<ProjectChatPanelProps> = ({ projectId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "안녕하세요! 이 프로젝트에 대해 무엇이든 물어보세요." }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [aiProvider, setAiProvider] = useState<"github_copilot" | "ollama">("github_copilot");
  const [pendingAction, setPendingAction] = useState<{text: string, useSubModel: boolean} | null>(null);
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Resizing state
  const [panelWidth, setPanelWidth] = useState(600);
  const isResizing = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("autowiki_chat_panel_width");
    if (saved) setPanelWidth(parseInt(saved));
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 300 && newWidth <= window.innerWidth * 0.8) {
      setPanelWidth(newWidth);
    }
  };

  const stopResizing = () => {
    isResizing.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopResizing);
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
    localStorage.setItem("autowiki_chat_panel_width", panelWidth.toString());
  };

  useEffect(() => {
    if (!isResizing.current) {
        localStorage.setItem("autowiki_chat_panel_width", panelWidth.toString());
    }
  }, [panelWidth]);

  const processMarkdown = (content: string) => {
    if (!content) return "";
    return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const loadSessions = async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/chat-sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);

        // Auto-load last session
        if (!currentSessionId) {
          const lastId = localStorage.getItem(`autowiki_last_chat_session_${projectId}`);
          if (lastId) {
            const sid = parseInt(lastId);
            if (data.some((s: ChatSession) => s.id === sid)) {
              handleSelectSession(sid);
            }
          } else if (data.length > 0) {
            // Optional: Auto-select most recent if no lastId (or maybe better to stay on new chat?)
            // handleSelectSession(data[0].id);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [projectId]);

  useEffect(() => {
    apiFetch("/api/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.ai_provider) {
          setAiProvider(data.ai_provider);
        }
      })
      .catch((err) => console.error("Failed to fetch user settings in ChatPanel:", err));
  }, []);

  const handleSelectSession = async (sessionId: number) => {
    if (isLoading) return;
    setCurrentSessionId(sessionId);
    if (window.innerWidth < 768) setIsHistoryOpen(false); // auto-close on mobile!
    localStorage.setItem(`autowiki_last_chat_session_${projectId}`, sessionId.toString());
    try {
      const res = await apiFetch(`/api/projects/${projectId}/chat-sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([{ role: "assistant", content: "안녕하세요! 이 프로젝트에 대해 무엇이든 물어보세요." }]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewChat = () => {
    if (isLoading) return;
    setCurrentSessionId(null);
    if (window.innerWidth < 768) setIsHistoryOpen(false); // auto-close on mobile!
    localStorage.removeItem(`autowiki_last_chat_session_${projectId}`);
    setMessages([{ role: "assistant", content: "안녕하세요! 이 프로젝트에 대해 무엇이든 물어보세요." }]);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    if (!confirm("정말 이 대화를 삭제하시겠습니까?")) return;
    try {
      const res = await apiFetch(`/api/projects/${projectId}/chat-sessions/${sessionId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (text: string, useSubModel: boolean, includeEntities: boolean = true, includeGraph: boolean = true, includeFiles: boolean = true) => {
    if (!text.trim() || isLoading) return;

    const newMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const modelName = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_model")) || "gemini-3-flash";
      const subModelName = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_sub_model")) || "gemini-3-flash";
      const activeModel = useSubModel ? subModelName : modelName;

      const thinkingLevel = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_thinking_level")) || "MEDIUM";
      const reasoningEffort = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_reasoning_effort")) || "medium";
      // We no longer send manual API keys from frontend; backend handles it via session and DB.
      const apiKey = "";

      const res = await apiFetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          model_name: activeModel,
          session_id: currentSessionId,
          thinking_level: thinkingLevel,
          reasoning_effort: reasoningEffort,
          api_key: apiKey,
          include_entities: includeEntities,
          include_graph: includeGraph,
          include_files: includeFiles
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (is401(res.status, errText)) {
          setMessages(messages); // revert
          setPendingAction({ text, useSubModel, includeEntities, includeGraph, includeFiles } as any);
          if (errText.includes("GitHub") || errText.includes("Token")) {
            setShowTutorial(true);
          } else {
            setShowAuthOverlay(true);
          }
          return;
        }
        throw new Error("Chat request failed");
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (!currentSessionId && data.session_id) {
        setCurrentSessionId(data.session_id);
        localStorage.setItem(`autowiki_last_chat_session_${projectId}`, data.session_id.toString());
      }
      loadSessions(); // refresh the list to show updated title/dates
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "assistant", content: "응답을 받지 못했습니다. 잠시 후 다시 시도해주세요." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthOverlay(false);
    const saved = pendingAction as any;
    setPendingAction(null);
    if (saved) {
      setTimeout(() => {
        handleSubmit(saved.text, saved.useSubModel, saved.includeEntities, saved.includeGraph, saved.includeFiles);
      }, 500);
    }
  };

  return (
    <div 
      className={`fixed right-0 top-0 bottom-0 bg-white border-l border-[#a2a9b1] shadow-2xl flex z-50 font-sans transition-all duration-300 transform translate-x-0 overflow-hidden
        ${isMobile ? 'w-full left-0 inset-0' : ''}`}
      style={!isMobile ? { width: `${panelWidth}px` } : {}}
    >
      {/* Resize Handle - desktop only */}
      <div
        onMouseDown={startResizing}
        className="hidden md:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#0645ad]/20 transition-colors z-[60]"
        title="드래그하여 크기 조절"
      />
      {/* Sidebar (Sessions) */}
      <div className={`
        ${isMobile ? (isHistoryOpen ? 'w-full' : 'hidden') : 'w-[200px] border-r'} 
        bg-[#f8f9fa] border-[#a2a9b1] flex flex-col transition-all duration-300 overflow-hidden shrink-0
      `}>
        {/* Mobile History Header */}
        {isMobile && isHistoryOpen && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#a2a9b1] bg-[#eaecf0] shrink-0">
            <span className="font-bold text-[#202122] text-[14px] flex items-center gap-1.5"><MessageSquare size={16} /> 대화 기록</span>
            <button 
              onClick={() => setIsHistoryOpen(false)} 
              className="text-[#54595d] hover:text-[#cc0000] p-1 rounded-sm hover:bg-[#c8ccd1] transition-colors"
              title="대화창으로 돌아가기"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-3 border-b border-[#a2a9b1]">
          <button 
            onClick={handleNewChat}
            className="w-full py-2 px-3 bg-white border border-[#a2a9b1] rounded-md text-[#202122] flex items-center gap-2 hover:bg-[#eaecf0] transition-colors text-sm font-medium"
          >
            <Plus size={16} /> 새 대화 시작
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <div 
              key={s.id}
              onClick={() => handleSelectSession(s.id)}
              className={`group flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors ${currentSessionId === s.id ? 'bg-[#eaecf0] font-medium' : 'hover:bg-[#eaecf0]'}`}
            >
              <div className="truncate text-[#202122] flex-1 mr-2" title={s.title}>
                {s.title}
              </div>
              <button 
                onClick={(e) => handleDeleteSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 text-[#54595d] hover:text-[#cc0000] p-1 rounded-sm hover:bg-[#c8ccd1] transition-all"
                title="삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="p-4 text-center text-xs text-[#72777d]">
              이전 대화가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 min-w-0 flex flex-col ${isMobile && isHistoryOpen ? 'hidden' : 'flex'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:py-4 border-b border-[#a2a9b1] bg-[#f8f9fa] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button 
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="md:hidden p-1 -ml-1 text-[#54595d] hover:bg-[#eaecf0] rounded-sm"
              title="대화 기록 보기"
            >
              <MessageSquare size={18} />
            </button>
            <h3 className="font-bold text-[#202122] text-[14px] sm:text-[15px] font-serif truncate">AI 채팅</h3>
          </div>
          <button onClick={onClose} className="text-[#54595d] hover:text-[#cc0000] p-1 rounded-sm hover:bg-[#eaecf0] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f1f5f9]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-[#0645ad] text-white" : "bg-[#f8f9fa] border border-[#a2a9b1] text-[#202122]"}`}>
                  {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={`p-3 rounded-md text-[13.5px] leading-relaxed break-words min-w-0 ${msg.role === "user" ? "bg-[#0645ad] text-white rounded-tr-none whitespace-pre-wrap" : "bg-white border border-[#a2a9b1] text-[#202122] rounded-tl-none shadow-sm markdown-body"}`}>
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {processMarkdown(msg.content)}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] flex gap-2">
                <div className="shrink-0 w-7 h-7 rounded-full bg-[#f8f9fa] border border-[#a2a9b1] text-[#202122] flex items-center justify-center">
                  <Bot size={14} />
                </div>
                <div className="p-3 bg-white border border-[#a2a9b1] text-[#202122] rounded-md rounded-tl-none shadow-sm flex items-center gap-2 text-[13.5px]">
                  <Loader2 size={14} className="animate-spin text-[#0645ad]" />
                  답변을 생성 중입니다...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-2 sm:p-3 bg-[#f8f9fa] border-t border-[#a2a9b1] pb-[calc(12px+env(safe-area-inset-bottom))]">
          <TextInputUI
            onSubmit={handleSubmit}
            title=""
            description=""
            placeholder="질문을 입력하세요"
            buttonText="전송"
            hideHeader={true}
            clearOnSubmit={true}
            isChat={true}
          />
        </div>
      </div>

      {showAuthOverlay && <AuthOverlay onSuccess={handleAuthSuccess} />}
      {showTutorial && (
        <SetupTutorial 
          initialProvider={aiProvider}
          onClose={() => {
            localStorage.setItem("autowiki_tutorial_seen", "true");
            setShowTutorial(false);
          }} 
          onGoToSettings={() => {
            localStorage.setItem("autowiki_tutorial_seen", "true");
            setShowTutorial(false);
            onClose(); // Close chat panel to see settings better? or just go to settings
            window.location.href = "/dashboard/settings"; 
          }} 
        />
      )}
    </div>
  );
};
