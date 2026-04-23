import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/api'

type AuthState = {
  token: string | null
  user: User | null
  setSession: (payload: { token: string; user: User }) => void
  setUser: (user: User) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      setUser: (user) => set({ user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    {
      name: 'essay-review-auth',
    },
  ),
)
