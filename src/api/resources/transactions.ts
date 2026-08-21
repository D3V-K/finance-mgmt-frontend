import { apiClient } from '@/api/client'
import type { Transaction, TransactionCreateDto, TransactionFilter, TransactionUpdateDto, UUID } from '@/api/types'

export const transactionsApi = {
  async list(filters: TransactionFilter = {}) {
    return (await apiClient.get<Transaction[]>('/transactions', { params: filters })).data
  },
  async get(id: UUID) {
    return (await apiClient.get<Transaction>(`/transactions/${id}`)).data
  },
  async create(payload: TransactionCreateDto) {
    return (await apiClient.post<Transaction>('/transactions', payload)).data
  },
  async update(id: UUID, payload: TransactionUpdateDto) {
    return (await apiClient.put<Transaction>(`/transactions/${id}`, payload)).data
  },
  async remove(id: UUID) {
    await apiClient.delete(`/transactions/${id}`)
  },
}
