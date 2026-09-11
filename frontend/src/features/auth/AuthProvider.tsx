import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { onUnauthorized } from '@/api/authEvents'
import type { User } from '@/api/types'
import { clearApiCaches } from '@/pwa/clearApiCache'

import { fetchMe, login as loginRequest, register as registerRequest } from './api'
import { type AuthState, AuthContext } from './authContext'
import {
  getLastUserId,
  getToken,
  hydrateToken,
  setLastUserId,
  setToken,
  watchOtherTabs,
} from './authStore'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)

  // Read the stored token during the first render, before anything can ask
  // whether we are signed in. `hasToken` runs first, so `getToken()` in the next
  // initialiser already sees the hydrated value.
  const [hasToken, setHasToken] = useState(() => hydrateToken() !== null)
  const [isResolving, setIsResolving] = useState(() => getToken() !== null)

  /**
   * Signing out has to be single-flight.
   *
   * A screen that fires five queries in parallel gets five 401s back. Without
   * this guard that is five cache clears and five navigations, and the user
   * watches the app flicker on its way to the login screen.
   */
  const signingOut = useRef(false)

  const clearSession = useCallback(() => {
    if (signingOut.current) return
    signingOut.current = true

    setToken(null)
    setUser(null)
    setHasToken(false)
    setIsResolving(false)
    queryClient.clear()
    void clearApiCaches()

    // Released on the next tick, so a burst of 401s from one screen collapses
    // into a single sign-out but the *next* session can still sign out.
    queueMicrotask(() => {
      signingOut.current = false
    })
  }, [queryClient])

  useEffect(() => onUnauthorized(clearSession), [clearSession])

  useEffect(
    () => watchOtherTabs((token) => (token === null ? clearSession() : undefined)),
    [clearSession],
  )

  // Resolve a stored token once. If there is none, `isResolving` started false
  // and there is nothing to do.
  useEffect(() => {
    if (getToken() === null) return

    let cancelled = false
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch((cause: unknown) => {
        // A 401 is already handled by the middleware. Anything else -- a network
        // blip, a proxy hiccup -- must NOT sign the user out: this is a PWA that
        // is expected to open on a bad connection and run from cache.
        //
        // It must not be swallowed in silence either. An earlier version of this
        // `catch` hid a `TypeError: Invalid URL` that broke every request in the
        // app, and the only symptom was a session that never resolved.
        if (import.meta.env.DEV) console.error('Could not resolve the session:', cause)
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const adopt = useCallback(
    async (response: { access_token: string; user: User }) => {
      // A *different* person signing in on this device must not inherit the
      // previous one's cached API responses: those sit in Cache Storage
      // unencrypted, and on a shared laptop that is somebody else's expenses.
      if (getLastUserId() !== response.user.id) {
        queryClient.clear()
        await clearApiCaches()
      }
      setToken(response.access_token)
      setLastUserId(response.user.id)
      setUser(response.user)
      setHasToken(true)
      setIsResolving(false)
    },
    [queryClient],
  )

  const value: AuthState = {
    user,
    isAuthenticated: hasToken,
    isResolving,
    signIn: async (email, password) => adopt(await loginRequest(email, password)),
    signUp: async (input) => adopt(await registerRequest(input)),
    signOut: clearSession,
    setUser,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
