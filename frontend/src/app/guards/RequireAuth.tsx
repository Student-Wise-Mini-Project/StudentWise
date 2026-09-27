import { Navigate, Outlet, useLocation } from 'react-router'

import { Spinner } from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import { useT } from '@/i18n/i18nContext'

/**
 * Protects everything behind it.
 *
 * The `isResolving` gate matters: on a cold start the token is in localStorage
 * but the user has not been fetched yet. Without it, every reload of a protected
 * page would flash the login screen on its way back to where you were.
 *
 * `?next=` remembers where you were going, so a session that expires mid-task
 * returns you to the task rather than the home screen.
 */
export function RequireAuth() {
  const t = useT()
  const { isAuthenticated, isResolving } = useAuth()
  const location = useLocation()

  if (isResolving) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size="lg" label={t('common.auth.signingIn')} />
      </div>
    )
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`
    const target = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
    return <Navigate to={target} replace />
  }

  return <Outlet />
}

/**
 * The other direction: an authenticated user has no business on /login.
 *
 * A brand-new account goes to the one-time Gmail offer rather than home. This
 * guard re-renders the instant sign-up succeeds, before the sign-up screen's own
 * navigation runs, so if it said "home" the offer would never be seen.
 */
export function RedirectIfAuthed() {
  const { isAuthenticated, isResolving, isNewAccount } = useAuth()
  if (isResolving) return null
  if (!isAuthenticated) return <Outlet />
  return <Navigate to={isNewAccount ? '/welcome/gmail' : '/'} replace />
}
