import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  avatar_url: string;
}

export interface ActiveProcess {
  projectId: string;
  type: "INGEST" | "COMMIT";
  status: "RUNNING" | "SUCCESS" | "ERROR";
  proposals?: any[];
  error?: string;
  userPrompt?: string;
  statusMessage?: string;
  streamedText?: string;
  completedDocs?: string[];
  currentWritingDoc?: string;
  batches?: string[];
  model?: string;
  subModel?: string;
  thinkingLevel?: string;
  reasoningEffort?: string;
  apiKey?: string;
}

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  tokens: number;
  setTokens: (tokens: number) => void;
  infiniteTokens: boolean;
  setInfiniteTokens: (infiniteTokens: boolean) => void;
  logout: () => void;
  activeProcess: ActiveProcess | null;
  setActiveProcess: (process: ActiveProcess | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  tokens: 100,
  setTokens: (tokens) => set({ tokens }),
  infiniteTokens: false,
  setInfiniteTokens: (infiniteTokens) => set({ infiniteTokens }),
  activeProcess: null,
  setActiveProcess: (activeProcess) => set({ activeProcess }),
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("autowiki_sid");
    }
    set({ user: null, tokens: 100, infiniteTokens: false, activeProcess: null });
  },
}));
