"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { apiFetch } from "@/lib/api";

export function BackgroundProcessManager() {
  const activeProjectId = useAuthStore((state) => state.activeProcess?.projectId);
  const activeStatus = useAuthStore((state) => state.activeProcess?.status);
  const activeType = useAuthStore((state) => state.activeProcess?.type);

  const runningProjectId = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const activeProcess = useAuthStore.getState().activeProcess;

    // If there is no active process or it's not a running commit, clean up
    if (
      !activeProcess ||
      activeProcess.type !== "COMMIT" ||
      activeProcess.status !== "RUNNING"
    ) {
      if (runningProjectId.current) {
        runningProjectId.current = null;
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      }
      return;
    }

    // If already streaming for this project, do not restart
    if (runningProjectId.current === activeProcess.projectId) {
      return;
    }

    // Start streaming
    runningProjectId.current = activeProcess.projectId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const projectId = activeProcess.projectId;
    const proposals = activeProcess.proposals || [];
    const userPrompt = activeProcess.userPrompt || "";
    const model = activeProcess.model || "";
    const subModel = activeProcess.subModel || "";
    const thinkingLevel = activeProcess.thinkingLevel || "";
    const reasoningEffort = activeProcess.reasoningEffort || "";
    const apiKey = activeProcess.apiKey || "";
    const isResume = !!activeProcess.streamedText;

    const startCommitStream = async () => {
      let active = true;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        const res = await apiFetch(`/api/projects/${projectId}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposals,
            custom_prompt: userPrompt,
            model_name: model,
            sub_model_name: subModel,
            thinking_level: thinkingLevel,
            reasoning_effort: reasoningEffort,
            api_key: apiKey,
            is_resume: isResume,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "서버와 연결을 설정하지 못했습니다.");
        }

        // Sync tokens immediately
        apiFetch("/api/users/me")
          .then((r) => r.json())
          .then((user_data) => {
            if (user_data.tokens !== undefined) {
              useAuthStore.getState().setTokens(user_data.tokens);
            }
            if (user_data.infinite_tokens !== undefined) {
              useAuthStore.getState().setInfiniteTokens(user_data.infinite_tokens);
            }
          })
          .catch((err) => console.error("Failed to sync tokens:", err));

        reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let partialLine = "";

        if (!reader) {
          throw new Error("스트림 데이터를 로드하지 못했습니다.");
        }

        while (active && !controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = (partialLine + chunk).split("\n");
          partialLine = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              try {
                const data = JSON.parse(dataStr);
                const current = useAuthStore.getState().activeProcess;

                // Make sure we are still on the same process run
                if (
                  !current ||
                  current.projectId !== projectId ||
                  current.status !== "RUNNING"
                ) {
                  active = false;
                  break;
                }

                if (data.type === "status") {
                  useAuthStore.getState().setActiveProcess({
                    ...current,
                    statusMessage: data.message,
                  });
                } else if (data.type === "stream_start") {
                  const prevBatches = current.batches || [];
                  useAuthStore.getState().setActiveProcess({
                    ...current,
                    batches: [...prevBatches, ""],
                  });
                } else if (data.type === "token") {
                  const content = data.content;
                  const prevText = current.streamedText || "";
                  const prevBatches = current.batches || [];
                  const nextBatches = [...prevBatches];

                  if (nextBatches.length === 0) {
                    nextBatches.push(content);
                  } else {
                    nextBatches[nextBatches.length - 1] += content;
                  }

                  // Parse completed docs from current stream text
                  const nextText = prevText + content;
                  const separatorRegex = /===\s*DOCUMENT_SEPARATOR:\s*(.*?)\s*===/g;
                  const matches = Array.from(nextText.matchAll(separatorRegex));
                  let completedDocs: string[] = current.completedDocs || [];
                  let currentWritingDoc = current.currentWritingDoc || "";

                  if (matches.length > 0) {
                    const docNames = matches.map((m) => {
                      let name = m[1].trim();
                      while (name.startsWith("[") && name.endsWith("]")) {
                        name = name.slice(1, -1).trim();
                      }
                      return name;
                    });
                    if (docNames.length > 1) {
                      const completed = docNames.slice(0, -1);
                      completedDocs = Array.from(
                        new Set([...completedDocs, ...completed])
                      );
                    }
                    currentWritingDoc = docNames[docNames.length - 1];
                  }

                  useAuthStore.getState().setActiveProcess({
                    ...current,
                    streamedText: nextText,
                    batches: nextBatches,
                    completedDocs,
                    currentWritingDoc,
                  });
                } else if (data.type === "stream_end") {
                  const writing = current.currentWritingDoc;
                  let completedDocs = current.completedDocs || [];
                  if (writing) {
                    const cleanName = writing.replace(/^\[|\]$/g, "");
                    completedDocs = Array.from(
                      new Set([...completedDocs, cleanName])
                    );
                  }
                  useAuthStore.getState().setActiveProcess({
                    ...current,
                    completedDocs,
                  });
                } else if (data.type === "done") {
                  const writing = current.currentWritingDoc;
                  let completedDocs = current.completedDocs || [];
                  if (writing) {
                    const cleanName = writing.replace(/^\[|\]$/g, "");
                    completedDocs = Array.from(
                      new Set([...completedDocs, cleanName])
                    );
                  }
                  useAuthStore.getState().setActiveProcess({
                    ...current,
                    completedDocs,
                    statusMessage: "모든 문서 반영 완료",
                    status: "SUCCESS",
                  });
                  return;
                } else if (data.type === "error") {
                  throw new Error(data.message);
                }
              } catch (e: any) {
                console.error("Stream parse warning", e);
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("Stream fetch aborted successfully.");
          return;
        }
        console.error("Commit stream background error:", err);
        const current = useAuthStore.getState().activeProcess;
        if (current && current.projectId === projectId) {
          useAuthStore.getState().setActiveProcess({
            ...current,
            status: "ERROR",
            error: err.message || "스트림 처리 도중 오류 발생",
          });
        }
      } finally {
        active = false;
        if (reader) {
          reader.cancel().catch(() => {});
        }
      }
    };

    startCommitStream();

    return () => {
      // Clean up abort controller if component unmounts or activeProcess changes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      runningProjectId.current = null;
    };
  }, [activeProjectId, activeStatus, activeType]);

  return null;
}
