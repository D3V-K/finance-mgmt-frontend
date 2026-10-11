import { apiClient } from '@/api/client'
import type { CanonicalCategoryReport, CanonicalMonthlyReport, DateRangeFilter, FinancialEvent, FinancialEventCreateDto, FinancialEventFilter, FinancialEventPage, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

export const eventsApi = {
  async list(filters: FinancialEventFilter = {}) {
    requireFeature('events')
    return (await apiClient.get<FinancialEventPage>('/financial-events', { params: filters })).data
  },
  async get(id: UUID) { requireFeature('events'); return (await apiClient.get<FinancialEvent>(`/financial-events/${id}`)).data },
  /** Pass an idempotency key so a retried submit returns the original event instead of a duplicate. */
  async create(payload: FinancialEventCreateDto) { requireFeature('events'); return (await apiClient.post<FinancialEvent>('/financial-events', payload)).data },
  /** Posts an offsetting reversal; the original stays in history. */
  async reverse(id: UUID) { requireFeature('events'); return (await apiClient.post<FinancialEvent>(`/financial-events/${id}/reverse`)).data },
  /** Reverses the original and posts a linked replacement atomically. Requires an idempotency key. */
  async replace(id: UUID, payload: FinancialEventCreateDto & { idempotency_key: string }) {
    requireFeature('events')
    return (await apiClient.post<FinancialEvent>(`/financial-events/${id}/replace`, payload)).data
  },
}

export const canonicalReportsApi = {
  async monthly(filters: DateRangeFilter = {}) {
    requireFeature('events')
    return (await apiClient.get<CanonicalMonthlyReport[]>('/reports/canonical-monthly', { params: filters })).data
  },
  async byCategory(filters: DateRangeFilter = {}) {
    requireFeature('events')
    return (await apiClient.get<CanonicalCategoryReport[]>('/reports/canonical-by-category', { params: filters })).data
  },
}
