import { apiClient } from '@/api/client'
import type { AllocationSummary, Bucket, BucketDto, BucketFundingDto, BucketFundingResult, BucketUpdateDto, Budget, BudgetCashAssumptionDto, BudgetCycleSummary, BudgetDto, ISODate, SavingsGoal, SavingsGoalDto, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

export const budgetsApi = {
  /** Cycle boundaries come from the server (payday setting and overrides). */
  async cycleSummary(on: ISODate) { requireFeature('budgets'); return (await apiClient.get<BudgetCycleSummary>(`/budget-cycles/${on}/summary`)).data },
  async save(payload: BudgetDto) { requireFeature('budgets'); return (await apiClient.put<Budget>('/budgets', { carryover: 'none', ...payload })).data },
  async saveCashAssumption(payload: BudgetCashAssumptionDto) { requireFeature('budgets'); return (await apiClient.put('/budgets/cash-assumptions', payload)).data },
}

export const goalsApi = {
  async list() { requireFeature('budgets'); return (await apiClient.get<SavingsGoal[]>('/savings-goals')).data },
  async create(payload: SavingsGoalDto) { requireFeature('budgets'); return (await apiClient.post<SavingsGoal>('/savings-goals', payload)).data },
  async update(id: UUID, payload: Partial<SavingsGoalDto>) { requireFeature('budgets'); return (await apiClient.patch<SavingsGoal>(`/savings-goals/${id}`, payload)).data },
}

export const allocationsApi = {
  async summary(asOfDate: ISODate) { requireFeature('budgets'); return (await apiClient.get<AllocationSummary>('/allocations', { params: { as_of_date: asOfDate } })).data },
  async createBucket(payload: BucketDto) { requireFeature('budgets'); return (await apiClient.post<Bucket>('/allocations/buckets', payload)).data },
  async updateBucket(id: UUID, payload: BucketUpdateDto) { requireFeature('budgets'); return (await apiClient.patch<Bucket>(`/allocations/buckets/${id}`, payload)).data },
  /** Positive amounts earmark existing cash; negative amounts release it. */
  async fundBucket(id: UUID, payload: BucketFundingDto) { requireFeature('budgets'); return (await apiClient.post<BucketFundingResult>(`/allocations/buckets/${id}/fund`, payload)).data },
}
