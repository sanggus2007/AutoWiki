"use client";

import React, { useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { UploadUI } from "@/components/UploadUI";
import { TextInputUI } from "@/components/TextInputUI";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ReviewUI, Proposal } from "@/components/ReviewUI";
import { AuthOverlay } from "@/components/AuthOverlay";
import { ArrowLeft, Loader2, Paperclip, MessageSquareText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SetupTutorial } from "@/components/SetupTutorial";


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

  const [appState, setAppState] = useState<AppState>("UPLOAD");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [savedFiles, setSavedFiles] = useState<File[]>([]);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // 분석 시 활용할 맥락 옵션 상태 보존
  const [includeEntities, setIncludeEntities] = useState(true);
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);

  const getModelKeys = () => ({
    model: localStorage.getItem("autowiki_llm_model") || "gemini-3.1-pro-preview",
    subModel: localStorage.getItem("autowiki_llm_sub_model") || "gemini-3-flash-preview",
    thinkingLevel: localStorage.getItem("autowiki_llm_thinking_level") || "HIGH",
    reasoningEffort: localStorage.getItem("autowiki_llm_reasoning_effort") || "high",
    key: localStorage.getItem("autowiki_github_token") || localStorage.getItem("autowiki_llm_api_key") || "",
  });

  // ── File upload analysis ────────────────────────────────────────────────────
  const runUpload = useCallback(async (files: File[], customPrompt: string, includeEntities: boolean, includeGraph: boolean, includeFiles: boolean) => {
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
          setPendingAction({ action: "upload", files, customPrompt, includeEntities, includeGraph, includeFiles });
          if (errText.includes("GitHub") || errText.includes("Token")) {
            alert("파일 분석에 필요한 GitHub 연동 정보가 없습니다. 안내 메뉴를 확인해 주세요.");
            setShowTutorial(true);
          } else {
            setShowAuthOverlay(true);
          }
          setAppState("UPLOAD");
          return;
        }
        // 토큰 한도 초과 에러 처리
        if (errText.includes("token") && (errText.includes("limit") || errText.includes("exceed"))) {
          alert("입력한 데이터와 선택된 맥락이 AI의 처리 한도를 초과했습니다. 하단의 'AI 분석 시 참고할 맥락' 체크박스(기존 문서 등)를 조절하여 맥락의 크기를 줄여보세요.");
          setAppState("UPLOAD");
          return;
        }

        if (res.status === 413) {
          alert("파일 용량이 너무 큽니다. 서버의 데이터 처리 제한을 초과했습니다. 더 작은 파일로 나누어 업로드해주세요.");
        } else {
          alert(`분석 실패: ${errText}`);
        }
        setAppState("UPLOAD");
        return;
      }
      const data = await res.json();
      setProposals(data.proposals || []);
      setAppState("REVIEW");
    } catch (err) {
      console.error("Network error:", err);
      setAppState("UPLOAD");
    }
  }, [projectId]);

  // ── Text-only analysis ──────────────────────────────────────────────────────
  const runTextAnalysis = useCallback(async (text: string, useSubModel: boolean, includeEntities: boolean, includeGraph: boolean, includeFiles: boolean) => {
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
          setPendingAction({ action: "text", text, useSubModel, includeEntities, includeGraph, includeFiles });
          if (errText.includes("GitHub") || errText.includes("Token")) {
            alert("AI 기능을 사용하려면 GitHub 계정 연동이 필요합니다. 안내에 따라 설정을 완료해 주세요.");
            setShowTutorial(true);
          } else {
            setShowAuthOverlay(true);
          }
          setAppState("UPLOAD");
          return;
        }
        // 토큰 한도 초과 에러 처리
        if (errText.includes("token") && (errText.includes("limit") || errText.includes("exceed"))) {
          alert("입력한 데이터와 선택된 맥락이 AI의 처리 한도를 초과했습니다. 분석 도구 하단의 체크박스(기존 문서, 관계도, 첨부 파일 등)를 일부 해제하여 맥락을 줄인 뒤 다시 시도해 주세요.");
          setAppState("UPLOAD");
          return;
        }
        
        console.error("Text analysis failed", errText);
        alert(`분석 실패: ${errText}`);
        setAppState("UPLOAD");
        return;
      }
      const data = await res.json();
      setProposals(data.proposals || []);
      setAppState("REVIEW");
    } catch (err) {
      console.error("Network error:", err);
      setAppState("UPLOAD");
    }
  }, [projectId]);

  // ── Commit ──────────────────────────────────────────────────────────────────
  const runCommit = useCallback(async (finalProposals: Proposal[]) => {
    setAppState("COMMITTING");
    const { model, subModel, thinkingLevel, reasoningEffort, key } = getModelKeys();

    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposals: finalProposals,
            custom_prompt: userPrompt,
            model_name: model,
            sub_model_name: subModel,
            thinking_level: thinkingLevel,
            reasoning_effort: reasoningEffort,
            api_key: key,
          }),
        }
      );
      if (res.ok) { router.push(`/dashboard/project/${projectId}`); return; }
      const errText = await res.text();
      if (is401(res.status, errText)) {
        setPendingAction({ action: "commit", finalProposals });
        setShowAuthOverlay(true);
        return;
      }
      console.error("Commit failed", errText);
      setAppState("REVIEW");
    } catch (err) {
      console.error("Commit network error", err);
      setAppState("REVIEW");
    }
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

  const handleConfirm = (finalProposals: Proposal[]) => runCommit(finalProposals);

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
    <div className="p-6 max-w-5xl mx-auto bg-white min-h-screen text-[#202122] font-sans">
      <button
        onClick={() => router.push(`/dashboard/project/${projectId}`)}
        className="text-[#0645ad] hover:underline text-[13px] flex items-center mb-4"
      >
        <ArrowLeft size={14} className="mr-1" /> 프로젝트로 돌아가기
      </button>

      <div className="border-b border-[#a2a9b1] mb-6 pb-2">
        <h1 className="text-2xl font-serif text-[#000000]">지식 추가 / 수정</h1>
        <p className="text-sm text-[#54595d]">파일을 업로드하거나 텍스트로 직접 AI에게 지시할 수 있습니다.</p>
      </div>

      {/* ── Tab selector (only shown in UPLOAD state) ─────────────────── */}
      {appState === "UPLOAD" && (
        <>
          <div className="flex border-b border-[#a2a9b1] mb-6">
            <button
              onClick={() => setInputMode("file")}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${inputMode === "file"
                ? "border-[#0645ad] text-[#0645ad]"
                : "border-transparent text-[#54595d] hover:text-[#202122]"
                }`}
            >
              <Paperclip size={14} /> 파일 업로드
            </button>
            <button
              onClick={() => setInputMode("text")}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${inputMode === "text"
                ? "border-[#0645ad] text-[#0645ad]"
                : "border-transparent text-[#54595d] hover:text-[#202122]"
                }`}
            >
              <MessageSquareText size={14} /> 텍스트로 직접 지시
            </button>
          </div>

          <div className="flex flex-col items-center justify-start py-4 w-full">
            {inputMode === "file" && <UploadUI onStartIngestion={handleStartIngestion} />}
            {inputMode === "text" && <TextInputUI onSubmit={handleTextSubmit} />}
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
        <div className="flex items-center justify-center py-8">
          <div className="text-center font-sans space-y-4">
            <Loader2 size={48} className="animate-spin text-[#0645ad] mx-auto" />
            <h2 className="text-2xl font-bold">AI가 위키 문서를 작성 중입니다...</h2>
            <p className="text-[#54595d]">
              승인된 기획안을 바탕으로 위키백과 수준의 상세 마크다운 문서를 렌더링하고 있습니다.<br />
              (항목 수에 따라 1~2분이 소요될 수 있습니다)
            </p>
          </div>
        </div>
      )}

      {/* ── Review ────────────────────────────────────────────────────── */}
      {appState === "REVIEW" && (
        <ReviewUI proposals={proposals} onConfirm={handleConfirm} onReanalyze={handleReanalyze} />
      )}

      {showAuthOverlay && <AuthOverlay onSuccess={handleAuthSuccess} />}
      {showTutorial && (
        <SetupTutorial 
          onClose={() => {
            localStorage.setItem("autowiki_tutorial_seen", "true");
            setShowTutorial(false);
          }} 
          onGoToSettings={() => {
            localStorage.setItem("autowiki_tutorial_seen", "true");
            router.push('/dashboard/settings');
          }} 
        />
      )}
    </div>
  );
}
