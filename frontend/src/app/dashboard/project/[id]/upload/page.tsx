"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { UploadUI } from "@/components/UploadUI";
import { TextInputUI } from "@/components/TextInputUI";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ReviewUI, Proposal } from "@/components/ReviewUI";
import { AuthOverlay } from "@/components/AuthOverlay";
import { ArrowLeft, Loader2, Paperclip, MessageSquareText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SetupTutorial } from "@/components/SetupTutorial";
import { GlassObserver } from "@/components/GlassObserver";
import { useAuthStore } from "@/lib/store";


type AppState = "UPLOAD" | "LOADING" | "REVIEW" | "COMMITTING";
type InputMode = "file" | "text";

interface PendingUpload {
  action: "upload";
  files: File[];
  customPrompt: string;
  includeEntities: boolean;
  includeGraph: boolean;
  includeFiles: boolean;
}
interface PendingTextAnalysis {
  action: "text";
  text: string;
  useSubModel: boolean;
  includeEntities: boolean;
  includeGraph: boolean;
  includeFiles: boolean;
}
interface PendingCommit {
  action: "commit";
  finalProposals: Proposal[];
}
type PendingAction = PendingUpload | PendingTextAnalysis | PendingCommit | null;

function is401(status: number, body: string) {
  return (
    status === 401 ||
    body.toLowerCase().includes("token expired") ||
    body.toLowerCase().includes("unauthorized")
  );
}

export default function ProjectUploadPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const { activeProcess, setActiveProcess } = useAuthStore();

  const [appState, setAppState] = useState<AppState>("UPLOAD");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [savedFiles, setSavedFiles] = useState<File[]>([]);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [includeEntities, setIncludeEntities] = useState(true);
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [aiProvider, setAiProvider] = useState<"github_copilot" | "ollama">("github_copilot");

  useEffect(() => {
    apiFetch("/api/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.ai_provider) {
          setAiProvider(data.ai_provider);
        }
      })
      .catch((err) => console.error("Failed to fetch user settings:", err));
  }, []);

  useEffect(() => {
    if (activeProcess && activeProcess.projectId === projectId) {
      if (activeProcess.status === "RUNNING") {
        if (activeProcess.type === "INGEST") {
          if (appState !== "LOADING") {
            setAppState("LOADING");
          }
        } else if (activeProcess.type === "COMMIT") {
          if (appState !== "COMMITTING") {
            setAppState("COMMITTING");
            if (activeProcess.userPrompt !== undefined && userPrompt !== activeProcess.userPrompt) {
              setUserPrompt(activeProcess.userPrompt);
            }
            if (activeProcess.proposals) {
              setProposals(activeProcess.proposals);
            }
          }
        }
      } else if (activeProcess.status === "SUCCESS") {
        if (activeProcess.type === "INGEST") {
          if (appState !== "REVIEW" && appState !== "COMMITTING") {
            setProposals(activeProcess.proposals || []);
            setAppState("REVIEW");
          }
        } else if (activeProcess.type === "COMMIT") {
          setActiveProcess(null);
          router.push(`/dashboard/project/${projectId}`);
        }
      } else if (activeProcess.status === "ERROR") {
        alert(`AI 분석 또는 반영 실패: ${activeProcess.error}`);
        setAppState("UPLOAD");
        setActiveProcess(null);
      }
    } else {
      if (appState === "LOADING" || appState === "COMMITTING") {
        setAppState("UPLOAD");
      }
    }
  }, [activeProcess, projectId, router, setActiveProcess, appState, userPrompt]);

  const getModelKeys = () => ({
    model: localStorage.getItem("autowiki_llm_model") || "gemini-3.1-pro-preview",
    subModel: localStorage.getItem("autowiki_llm_sub_model") || "gemini-3-flash-preview",
    thinkingLevel: localStorage.getItem("autowiki_llm_thinking_level") || "HIGH",
    reasoningEffort: localStorage.getItem("autowiki_llm_reasoning_effort") || "high",
    key: localStorage.getItem("autowiki_llm_key") || "",
  });

  // ── File upload analysis ────────────────────────────────────────────────────
  const runUpload = useCallback(async (files: File[], customPrompt: string, includeEntities: boolean, includeGraph: boolean, includeFiles: boolean) => {
    useAuthStore.getState().setActiveProcess({
      projectId,
      type: "INGEST",
      status: "RUNNING"
    });
    setAppState("LOADING");
    const { model, subModel, thinkingLevel, reasoningEffort, key } = getModelKeys();

    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    formData.append("model_name", model);
    formData.append("sub_model_name", subModel);
    formData.append("thinking_level", thinkingLevel);
    formData.append("reasoning_effort", reasoningEffort);
    formData.append("api_key", key);
    formData.append("custom_prompt", customPrompt);
    formData.append("include_entities", String(includeEntities));
    formData.append("include_graph", String(includeGraph));
    formData.append("include_files", String(includeFiles));

    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/upload`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const errText = await res.text();
        if (is401(res.status, errText)) {
          useAuthStore.getState().setActiveProcess(null);
          setPendingAction({ action: "upload", files, customPrompt, includeEntities, includeGraph, includeFiles });
          if (errText.includes("GitHub") || errText.includes("Token") || errText.includes("key")) {
            alert(`AI 분석 인증 오류: ${errText}`);
            setShowTutorial(true);
          } else {
            alert(`세션 오류 (재로그인 필요): ${errText}`);
            setShowAuthOverlay(true);
          }
          setAppState("UPLOAD");
          return;
        }
        // 토큰 한도 초과 에러 처리
        let errorMsg = errText;
        if (errText.includes("token") && (errText.includes("limit") || errText.includes("exceed"))) {
          errorMsg = "입력한 데이터와 선택된 맥락이 AI의 처리 한도를 초과했습니다. 하단의 'AI 분석 시 참고할 맥락' 체크박스(기존 문서 등)를 조절하여 맥락의 크기를 줄여보세요.";
        } else if (res.status === 413) {
          errorMsg = "파일 용량이 너무 큽니다. 서버의 데이터 처리 제한을 초과했습니다. 더 작은 파일로 나누어 업로드해주세요.";
        }
        useAuthStore.getState().setActiveProcess({
          projectId,
          type: "INGEST",
          status: "ERROR",
          error: errorMsg
        });
        return;
      }
      const data = await res.json();
      useAuthStore.getState().setActiveProcess({
        projectId,
        type: "INGEST",
        status: "SUCCESS",
        proposals: data.proposals || []
      });

      // Refresh global token state
      apiFetch("/api/users/me")
        .then(res => res.json())
        .then(user_data => {
          if (user_data.tokens !== undefined) {
            useAuthStore.getState().setTokens(user_data.tokens);
          }
          if (user_data.infinite_tokens !== undefined) {
            useAuthStore.getState().setInfiniteTokens(user_data.infinite_tokens);
          }
        })
        .catch(err => console.error("Failed to sync tokens:", err));
    } catch (err: any) {
      console.error("Network error:", err);
      useAuthStore.getState().setActiveProcess({
        projectId,
        type: "INGEST",
        status: "ERROR",
        error: err.message || "네트워크 오류"
      });
    }
  }, [projectId]);

  // ── Text-only analysis ──────────────────────────────────────────────────────
  const runTextAnalysis = useCallback(async (text: string, useSubModel: boolean, includeEntities: boolean, includeGraph: boolean, includeFiles: boolean) => {
    useAuthStore.getState().setActiveProcess({
      projectId,
      type: "INGEST",
      status: "RUNNING"
    });
    setAppState("LOADING");
    const { model, subModel, thinkingLevel, reasoningEffort, key } = getModelKeys();
    const chosenModel = useSubModel ? subModel : model;

    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/analyze-text`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            model_name: chosenModel,
            thinking_level: thinkingLevel,
            reasoning_effort: reasoningEffort,
            api_key: key,
            include_entities: includeEntities,
            include_graph: includeGraph,
            include_files: includeFiles
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        if (is401(res.status, errText)) {
          useAuthStore.getState().setActiveProcess(null);
          setPendingAction({ action: "text", text, useSubModel, includeEntities, includeGraph, includeFiles });
          if (errText.includes("GitHub") || errText.includes("Token") || errText.includes("key")) {
            alert(`AI 분석 인증 오류: ${errText}`);
            setShowTutorial(true);
          } else {
            alert(`세션 오류 (재로그인 필요): ${errText}`);
            setShowAuthOverlay(true);
          }
          setAppState("UPLOAD");
          return;
        }
        // 토큰 한도 초과 에러 처리
        let errorMsg = errText;
        if (errText.includes("token") && (errText.includes("limit") || errText.includes("exceed"))) {
          errorMsg = "입력한 데이터와 선택된 맥락이 AI의 처리 한도를 초과했습니다. 분석 도구 하단의 체크박스(기존 문서, 관계도, 첨부 파일 등)를 일부 해제하여 맥락을 줄인 뒤 다시 시도해 주세요.";
        }
        useAuthStore.getState().setActiveProcess({
          projectId,
          type: "INGEST",
          status: "ERROR",
          error: errorMsg
        });
        return;
      }
      const data = await res.json();
      useAuthStore.getState().setActiveProcess({
        projectId,
        type: "INGEST",
        status: "SUCCESS",
        proposals: data.proposals || []
      });

      // Refresh global token state
      apiFetch("/api/users/me")
        .then(res => res.json())
        .then(user_data => {
          if (user_data.tokens !== undefined) {
            useAuthStore.getState().setTokens(user_data.tokens);
          }
          if (user_data.infinite_tokens !== undefined) {
            useAuthStore.getState().setInfiniteTokens(user_data.infinite_tokens);
          }
        })
        .catch(err => console.error("Failed to sync tokens:", err));
    } catch (err: any) {
      console.error("Network error:", err);
      useAuthStore.getState().setActiveProcess({
        projectId,
        type: "INGEST",
        status: "ERROR",
        error: err.message || "네트워크 오류"
      });
    }
  }, [projectId]);

  // ── Commit ──────────────────────────────────────────────────────────────────
  const runCommit = useCallback(async (finalProposals: Proposal[]) => {
    const { model, subModel, thinkingLevel, reasoningEffort, key } = getModelKeys();
    useAuthStore.getState().setActiveProcess({
      projectId,
      type: "COMMIT",
      status: "RUNNING",
      userPrompt,
      proposals: finalProposals,
      model,
      subModel,
      thinkingLevel,
      reasoningEffort,
      apiKey: key
    });
    setAppState("COMMITTING");
  }, [projectId, userPrompt]);

  // ── Public handlers ─────────────────────────────────────────────────────────
  const handleStartIngestion = (files: File[], customPrompt: string, iEnt: boolean, iGra: boolean, iFil: boolean) => {
    setUserPrompt(customPrompt);
    setSavedFiles(files);
    setIncludeEntities(iEnt);
    setIncludeGraph(iGra);
    setIncludeFiles(iFil);
    runUpload(files, customPrompt, iEnt, iGra, iFil);
  };

  const handleTextSubmit = (text: string, useSubModel: boolean, iEnt: boolean, iGra: boolean, iFil: boolean) => {
    setUserPrompt(text);
    setIncludeEntities(iEnt);
    setIncludeGraph(iGra);
    setIncludeFiles(iFil);
    runTextAnalysis(text, useSubModel, iEnt, iGra, iFil);
  };

  const handleConfirm = (finalProposals: Proposal[]) => {
    setProposals(finalProposals);
    const { model, subModel, thinkingLevel, reasoningEffort, key } = getModelKeys();
    setActiveProcess({
      projectId,
      type: "COMMIT",
      status: "RUNNING",
      userPrompt,
      proposals: finalProposals,
      model,
      subModel,
      thinkingLevel,
      reasoningEffort,
      apiKey: key
    });
    setAppState("COMMITTING");
  };

  const handleCancelPlanning = () => {
    setActiveProcess(null);
    setProposals([]);
    setAppState("UPLOAD");
  };

  const handleReanalyze = (feedback: string) => {
    const combined = feedback + (userPrompt ? `\n\n기존 지시사항: ${userPrompt}` : "");
    if (savedFiles.length > 0) {
      runUpload(savedFiles, combined, includeEntities, includeGraph, includeFiles);
    } else {
      runTextAnalysis(combined, false, includeEntities, includeGraph, includeFiles);
    }
  };

  // ── Auth retry ──────────────────────────────────────────────────────────────
  const handleAuthSuccess = useCallback(() => {
    setShowAuthOverlay(false);
    const saved = pendingAction;
    setPendingAction(null);
    if (!saved) return;
    setTimeout(() => {
      if (saved.action === "upload") {
        runUpload(saved.files, saved.customPrompt, saved.includeEntities, saved.includeGraph, saved.includeFiles);
      } else if (saved.action === "text") {
        runTextAnalysis(saved.text, saved.useSubModel, saved.includeEntities, saved.includeGraph, saved.includeFiles);
      } else {
        runCommit(saved.finalProposals);
      }
    }, 500);
  }, [pendingAction, runUpload, runTextAnalysis, runCommit]);

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white dark:bg-[#121212] min-h-screen text-[#202122] dark:text-[#eaecf0] font-sans transition-colors duration-200">
      <button
        onClick={() => router.push(`/dashboard/project/${projectId}`)}
        className="text-[#0645ad] dark:text-blue-400 hover:underline text-[13px] flex items-center mb-4"
      >
        <ArrowLeft size={14} className="mr-1" /> 프로젝트로 돌아가기
      </button>

      <div className="border-b border-[#a2a9b1] dark:border-zinc-800 mb-6 pb-2">
        <h1 className="text-2xl font-serif text-[#000000] dark:text-white">지식 추가 / 수정</h1>
        <p className="text-sm text-[#54595d] dark:text-gray-400">파일을 업로드하거나 텍스트로 직접 AI에게 지시할 수 있습니다.</p>
      </div>

      {/* ── Tab selector (only shown in UPLOAD state) ─────────────────── */}
      {appState === "UPLOAD" && (
        <>
          <div className="flex border-b border-[#a2a9b1] dark:border-zinc-800 mb-6">
            <button
              onClick={() => setInputMode("text")}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${inputMode === "text"
                ? "border-[#0645ad] dark:border-blue-400 text-[#0645ad] dark:text-blue-400"
                : "border-transparent text-[#54595d] dark:text-gray-400 hover:text-[#202122] dark:hover:text-white"
                }`}
            >
              <MessageSquareText size={14} /> 텍스트로 직접 지시
            </button>
            <button
              onClick={() => setInputMode("file")}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${inputMode === "file"
                ? "border-[#0645ad] dark:border-blue-400 text-[#0645ad] dark:text-blue-400"
                : "border-transparent text-[#54595d] dark:text-gray-400 hover:text-[#202122] dark:hover:text-white"
                }`}
            >
              <Paperclip size={14} /> 파일 업로드
            </button>
          </div>

          <div className="flex flex-col items-center justify-start py-4 w-full">
            {inputMode === "text" && <TextInputUI onSubmit={handleTextSubmit} />}
            {inputMode === "file" && <UploadUI onStartIngestion={handleStartIngestion} />}
          </div>
        </>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {appState === "LOADING" && (
        <div className="flex items-center justify-center py-8">
          <LoadingScreen onComplete={() => { }} />
        </div>
      )}

      {/* ── Committing ────────────────────────────────────────────────── */}
      {appState === "COMMITTING" && (
        <GlassObserver
          projectId={projectId}
        />
      )}

      {/* ── Review ────────────────────────────────────────────────────── */}
      {appState === "REVIEW" && (
        <ReviewUI proposals={proposals} onConfirm={handleConfirm} onReanalyze={handleReanalyze} onCancel={handleCancelPlanning} />
      )}

      {showAuthOverlay && <AuthOverlay onSuccess={handleAuthSuccess} />}
      {showTutorial && (
        <SetupTutorial 
          userId={useAuthStore.getState().user?.id}
          initialProvider={aiProvider}
          onClose={() => {
            const user = useAuthStore.getState().user;
            if (user) {
              localStorage.setItem(`autowiki_tutorial_seen_${user.id}`, "true");
            }
            localStorage.setItem("autowiki_tutorial_seen", "true");
            setShowTutorial(false);
          }} 
          onGoToSettings={() => {
            const user = useAuthStore.getState().user;
            if (user) {
              localStorage.setItem(`autowiki_tutorial_seen_${user.id}`, "true");
            }
            localStorage.setItem("autowiki_tutorial_seen", "true");
            router.push('/dashboard/settings');
          }} 
        />
      )}
    </div>
  );
}
