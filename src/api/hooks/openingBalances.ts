import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { openingBalancesApi } from '@/api/resources/openingBalances'
import { balanceKeys } from '@/api/hooks/balance'
import type { AccountType, OpeningBalanceUpsertDto } from '@/api/types'
export const openingBalanceKeys = { all: ['opening-balances'] as const }
export function useOpeningBalances() {
  return useQuery({ queryKey: openingBalanceKeys.all, queryFn: openingBalancesApi.list })
}
export function useSaveOpeningBalance() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ account, payload }: { account: AccountType; payload: OpeningBalanceUpsertDto }) => openingBalancesApi.upsert(account, payload),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: openingBalanceKeys.all }),
      client.invalidateQueries({ queryKey: balanceKeys.all }),
      client.invalidateQueries({ queryKey: ['reports', 'net-worth'] }),
    ]),
  })
}
