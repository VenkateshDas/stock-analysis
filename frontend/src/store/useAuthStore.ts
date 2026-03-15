import { create } from 'zustand'
import { api } from '../services/api'

interface AuthState {
  token: string | null
  username: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, password: string, inviteCode?: string) => Promise<void>
  logout: () => void
  hydrate: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  username: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (username: string, password: string) => {
    set({ error: null })
    const data = await api.login(username, password)
    localStorage.setItem('auth_token', data.access_token)
    set({ token: data.access_token, username: username.toLowerCase(), isAuthenticated: true })
  },

  signup: async (username: string, password: string, inviteCode = '') => {
    set({ error: null })
    const data = await api.signup(username, password, inviteCode)
    localStorage.setItem('auth_token', data.access_token)
    set({ token: data.access_token, username: username.toLowerCase(), isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    set({ token: null, username: null, isAuthenticated: false, error: null })
  },

  hydrate: async () => {
    const stored = localStorage.getItem('auth_token')
    if (!stored) {
      set({ isLoading: false })
      return false
    }
    try {
      const me = await api.getMe()
      set({ token: stored, username: me.username, isAuthenticated: true, isLoading: false })
      return true
    } catch {
      localStorage.removeItem('auth_token')
      set({ token: null, username: null, isAuthenticated: false, isLoading: false })
      return false
    }
  },
}))
