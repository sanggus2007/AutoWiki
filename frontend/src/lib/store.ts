import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  avatar_url: string;
}

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  tokens: number;
  setTokens: (tokens: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  tokens: 100,
  setTokens: (tokens) => set({ tokens }),
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("autowiki_sid");
    }
    set({ user: null, tokens: 100 });
  },
}));
