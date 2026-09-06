import { apiClient } from '@/api/client'
import type { PaginatedResponse, Transfer, TransferCreateDto, TransferFilter, UUID } from '@/api/types'

export const transfersApi = {
  async list(filters: TransferFilter = {}) {
    return (await apiClient.get<PaginatedResponse<Transfer>>('/transfers', { params: filters })).data
  },
  async get(id: UUID) {
    return (await apiClient.get<Transfer>(`/transfers/${id}`)).data
  },
  async create(payload: TransferCreateDto) {
    return (await apiClient.post<Transfer>('/transfers', payload)).data
  },
  async remove(id: UUID) { await apiClient.delete(`/transfers/${id}`) },
}
