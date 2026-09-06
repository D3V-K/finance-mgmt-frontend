import { apiClient } from '@/api/client'
import type { AccountType, OpeningBalance, OpeningBalanceUpsertDto } from '@/api/types'

export const openingBalancesApi = {
  async list() { return (await apiClient.get<OpeningBalance[]>('/opening-balances')).data },
  async upsert(account: AccountType, payload: OpeningBalanceUpsertDto) {
    return (await apiClient.put<OpeningBalance>(`/opening-balances/${account}`, payload)).data
  },
}
