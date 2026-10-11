import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'
import { FeatureDisabledError } from '@/config/features'

export function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof FeatureDisabledError) return false
  if (error instanceof ApiError && ['unauthorized', 'forbidden', 'validation', 'conflict', 'not-found', 'disabled'].includes(error.kind)) {
    return false
  }
  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})
