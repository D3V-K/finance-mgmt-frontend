import { useQuery } from '@tanstack/react-query'
import { balanceApi } from '@/api/resources/balance'
export const balanceKeys = { all: ['reports', 'balance'] as const }
export function useCurrentBalance() {
  return useQuery({ queryKey: balanceKeys.all, queryFn: balanceApi.current })
}
