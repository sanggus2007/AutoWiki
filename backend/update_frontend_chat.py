import os

frontend_code = """\"\"\"use client\"\"\";

import React, { useState, useRef, useEffect } from "react";
import { X, MessageSquare, Loader2, Bot, User, Plus, Trash2 } from "lucide-react";
import { TextInputUI } from "./TextInputUI";
import { AuthOverlay } from "./AuthOverlay";
import { apiFetch } from "@/lib/api";

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
  const [pendingAction, setPendingAction] = useState<{text: string, useSubModel: boolean} | null>(null);
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const loadSessions = async () => {
    try {
      const res = await apiFetch(`http://localhost:8000/api/projects/${projectId}/chat-sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [projectId]);

  const handleSelectSession = async (sessionId: number) => {
    if (isLoading) return;
    setCurrentSessionId(sessionId);
    try {
      const res = await apiFetch(`http://localhost:8000/api/projects/${projectId}/chat-sessions/${sessionId}`);
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
    setMessages([{ role: "assistant", content: "안녕하세요! 이 프로젝트에 대해 무엇이든 물어보세요." }]);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    if (!confirm("정말 이 대화를 삭제하시겠습니까?")) return;
    try {
      const res = await apiFetch(`http://localhost:8000/api/projects/${projectId}/chat-sessions/${sessionId}`, {
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

  const handleSubmit = async (text: string, useSubModel: boolean) => {
    if (!text.trim() || isLoading) return;

    const newMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const modelName = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_model")) || "gpt-4o";
      const subModelName = (typeof window !== "undefined" && localStorage.getItem("autowiki_llm_sub_model")) || "gpt-4o-mini";
      const activeModel = useSubModel ? subModelName : modelName;

      const res = await apiFetch(`http://localhost:8000/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          model_name: activeModel,
          session_id: currentSessionId
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (is401(res.status, errText)) {
          setMessages(messages); // revert
          setPendingAction({ text, useSubModel });
          setShowAuthOverlay(true);
          return;
        }
        throw new Error("Chat request failed");
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (!currentSessionId && data.session_id) {
        setCurrentSessionId(data.session_id);
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
    const saved = pendingAction;
    setPendingAction(null);
    if (saved) {
      setTimeout(() => {
        handleSubmit(saved.text, saved.useSubModel);
      }, 500);
    }
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-white border-l border-[#a2a9b1] shadow-2xl flex z-50 font-sans transition-transform duration-300 transform translate-x-0">
      
      {/* Sidebar (Sessions) */}
      <div className="w-[200px] bg-[#f8f9fa] border-r border-[#a2a9b1] flex flex-col">
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
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#a2a9b1] bg-[#f8f9fa]">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[#0645ad]" />
            <h3 className="font-bold text-[#202122] text-[15px] font-serif">프로젝트 AI 채팅</h3>
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
                <div className={`p-3 rounded-md text-[13.5px] leading-relaxed break-words whitespace-pre-wrap ${msg.role === "user" ? "bg-[#0645ad] text-white rounded-tr-none" : "bg-white border border-[#a2a9b1] text-[#202122] rounded-tl-none shadow-sm"}`}>
                  {msg.content}
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
        <div className="p-3 bg-[#f8f9fa] border-t border-[#a2a9b1]">
          <TextInputUI
            onSubmit={handleSubmit}
            title=""
            description=""
            placeholder="이곳에 프로젝트 질문을 입력하세요...&#13;&#10;(Enter 줄바꿈, Ctrl+Enter 전송)"
            buttonText="전송"
            hideHeader={true}
            clearOnSubmit={true}
          />
        </div>
      </div>

      {showAuthOverlay && <AuthOverlay onSuccess={handleAuthSuccess} />}
    </div>
  );
};
"""

with open(r'd:\AntigravityProject\AutoWiki\frontend\src\components\ProjectChatPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(frontend_code.replace('"""use client""";', '"use client";'))

print("ProjectChatPanel.tsx updated!")
