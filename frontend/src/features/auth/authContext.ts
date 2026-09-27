import { createContext, use } from 'react'

import type { User } from '@/api/types'

export type AuthState = {
  user: User | null
  isAuthenticated: boolean
  /** True until a stored token has been resolved, so guards do not bounce early. */
  isResolving: boolean
  /**
   * The account was created in this session, by `signUp`. The guard that moves
   * a signed-in user off the sign-up screen reads it, so a brand-new account
   * lands on the one-time Gmail offer instead of racing past it to home.
   */
  isNewAccount: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>
  signOut: () => void
  setUser: (user: User) => void
}

/**
 * In its own file so `AuthProvider.tsx` exports only a component and fast
 * refresh keeps working -- otherwise editing the provider does a full reload and
 * signs you out of the app you were testing.
 */
export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
