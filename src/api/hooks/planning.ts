import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { allocationsApi, budgetsApi, goalsApi } from '@/api/resources/planning'
import type { BucketDto, BucketFundingDto, BucketUpdateDto, BudgetCashAssumptionDto, BudgetDto, ISODate, SavingsGoalDto, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

export function useBudgetCycle(on: ISODate | undefined) {
  return useQuery({ queryKey: ledgerKeys.budgets.cycle(on ?? ''), queryFn: () => budgetsApi.cycleSummary(on!), enabled: isFeatureEnabled('budgets') && Boolean(on) })
}

export function useSavingsGoals() {
  return useQuery({ queryKey: ledgerKeys.goals.all, queryFn: goalsApi.list, enabled: isFeatureEnabled('budgets') })
}

export function useAllocations(asOf: ISODate | undefined) {
  return useQuery({ queryKey: ledgerKeys.allocations.summary(asOf ?? ''), queryFn: () => allocationsApi.summary(asOf!), enabled: isFeatureEnabled('budgets') && Boolean(asOf) })
}

export function useSaveBudget() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: BudgetDto) => budgetsApi.save(payload), onSuccess: () => invalidateFor(client, 'budget') })
}

export function useSaveBudgetCashAssumption() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: BudgetCashAssumptionDto) => budgetsApi.saveCashAssumption(payload), onSuccess: () => invalidateFor(client, 'budget') })
}

export function useCreateGoal() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: SavingsGoalDto) => goalsApi.create(payload), onSuccess: () => invalidateFor(client, 'goal') })
}

export function useUpdateGoal() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, payload }: { id: UUID; payload: Partial<SavingsGoalDto> }) => goalsApi.update(id, payload), onSuccess: () => invalidateFor(client, 'goal') })
}

export function useCreateBucket() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: BucketDto) => allocationsApi.createBucket(payload), onSuccess: () => invalidateFor(client, 'bucket') })
}

export function useUpdateBucket() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, payload }: { id: UUID; payload: BucketUpdateDto }) => allocationsApi.updateBucket(id, payload), onSuccess: () => invalidateFor(client, 'bucket') })
}

export function useFundBucket() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, payload }: { id: UUID; payload: BucketFundingDto }) => allocationsApi.fundBucket(id, payload), onSuccess: () => invalidateFor(client, 'bucket') })
}
