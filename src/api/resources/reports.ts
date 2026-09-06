import { apiClient } from '@/api/client'
import type { CategoryReport, DateRangeFilter, MonthlyReport, NetBalancePoint } from '@/api/types'

export const reportsApi = {
  async monthly(filters: DateRangeFilter = {}) {
    return (await apiClient.get<MonthlyReport[]>('/reports/monthly', { params: filters })).data
  },
  async byCategory(filters: DateRangeFilter = {}) {
    return (await apiClient.get<CategoryReport[]>('/reports/by-category', { params: filters })).data
  },
  async netBalance(filters: DateRangeFilter = {}) {
    return (await apiClient.get<NetBalancePoint[]>('/reports/net-worth', { params: filters })).data
  },
  async netWorth(filters: DateRangeFilter = {}) {
    return (await apiClient.get<NetBalancePoint[]>('/reports/net-worth', { params: filters })).data
  },
}
