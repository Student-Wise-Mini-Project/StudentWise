import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter } from 'react-router'

import { createQueryClient } from '@/api/queryClient'

import { AppRoutes } from './routes'

/**
 * The provider stack, and nothing else.
 *
 * The QueryClient is created in state rather than at module scope so that tests
 * (and React's strict-mode double render) get a fresh cache instead of leaking
 * one test's data into the next.
 */
export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
