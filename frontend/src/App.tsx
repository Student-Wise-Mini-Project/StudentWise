import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter } from 'react-router'

import { createQueryClient } from '@/api/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'

import { AppRoutes } from './routes'

/**
 * The provider stack, and nothing else.
 *
 * Order matters: `AuthProvider` calls `queryClient.clear()` when a session ends,
 * so it has to sit inside `QueryClientProvider`. It also navigates, so the
 * router has to be outside it -- hence `BrowserRouter` wrapping rather than
 * being wrapped.
 *
 * The QueryClient is created in state rather than at module scope so tests, and
 * strict mode's double render, get a fresh cache instead of leaking one test's
 * data into the next.
 */
export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
