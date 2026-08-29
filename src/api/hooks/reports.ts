import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/api/resources/reports'
import type { DateRangeFilter } from '@/api/types'

export const reportKeys = {
  all: ['reports'] as const,
  monthly: (filters: DateRangeFilter) => [...reportKeys.all, 'monthly', filters] as const,
  byCategory: (filters: DateRangeFilter) => [...reportKeys.all, 'by-category', filters] as const,
  netWorth: (filters: DateRangeFilter) => [...reportKeys.all, 'net-worth', filters] as const,
}

export function useMonthlyReport(filters: DateRangeFilter = {}, enabled = true) {
  return useQuery({ queryKey: reportKeys.monthly(filters), queryFn: () => reportsApi.monthly(filters), enabled })
}

export function useCategoryReport(filters: DateRangeFilter = {}, enabled = true) {
  return useQuery({ queryKey: reportKeys.byCategory(filters), queryFn: () => reportsApi.byCategory(filters), enabled })
}

export function useNetWorthReport(filters: DateRangeFilter = {}) {
  return useQuery({ queryKey: reportKeys.netWorth(filters), queryFn: () => reportsApi.netWorth(filters) })
}
