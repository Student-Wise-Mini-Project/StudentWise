import { QueryClient } from '@tanstack/react-query'

import { isApiError } from './errors'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * THIS LINE IS WHY OFFLINE READS WORK.
         *
         * TanStack Query defaults to `networkMode: 'online'`, which *pauses*
         * queries when the browser reports being offline. The fetch then never
         * happens, the service worker is never consulted, and the app opens to a
         * screen full of spinners with a perfectly good cache sitting on disk.
         *
         * `offlineFirst` issues the request anyway and lets the service worker's
         * NetworkFirst handler answer it from `api-reads`.
         */
        networkMode: 'offlineFirst',

        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,

        /**
         * Never retry a 4xx. A 403 will be a 403 the second time too, and
         * retrying a 409 on an idempotency key just makes the log confusing.
         */
        retry: (failureCount, error) => {
          if (isApiError(error)) return error.status >= 500 && failureCount < 2
          return failureCount < 2
        },
      },
      mutations: {
        networkMode: 'online',
        retry: 0,
      },
    },
  })
}
