import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { cardsApi } from '@/api/resources/cards'
import type { CardScheduleCreateDto, CardScheduleUpdateDto, CardSettingsDto, CardStatementConfirmDto, PaymentAllocationDto, RefundAllocationDto, ReserveDto, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

const on = (cardId: UUID | undefined) => isFeatureEnabled('cards') && Boolean(cardId)

export function useCardSettings(cardId: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.cards.settings(cardId ?? ''), queryFn: () => cardsApi.settings(cardId!), enabled: on(cardId) })
}

export function useCardSchedules(cardId: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.cards.schedules(cardId ?? ''), queryFn: () => cardsApi.schedules(cardId!), enabled: on(cardId) })
}

export function useCardStatements(cardId: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.cards.statements(cardId ?? ''), queryFn: () => cardsApi.statements(cardId!), enabled: on(cardId) })
}

export function useSaveCardSettings() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ cardId, payload }: { cardId: UUID; payload: CardSettingsDto }) => cardsApi.saveSettings(cardId, payload), onSuccess: () => invalidateFor(client, 'card-settings') })
}

export function useCreateCardSchedule() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ cardId, payload }: { cardId: UUID; payload: CardScheduleCreateDto }) => cardsApi.createSchedule(cardId, payload), onSuccess: () => invalidateFor(client, 'card-schedule') })
}

export function useUpdateCardSchedule() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, scheduleId, payload }: { cardId: UUID; scheduleId: UUID; payload: CardScheduleUpdateDto }) => cardsApi.updateSchedule(cardId, scheduleId, payload),
    onSuccess: () => invalidateFor(client, 'card-schedule'),
  })
}

export function useConfirmCardStatement() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ cardId, payload }: { cardId: UUID; payload: CardStatementConfirmDto }) => cardsApi.confirmStatement(cardId, payload), onSuccess: () => invalidateFor(client, 'card-schedule') })
}

export function useLinkCardPayment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, scheduleId, payload }: { cardId: UUID; scheduleId: UUID; payload: PaymentAllocationDto }) => cardsApi.linkPayment(cardId, scheduleId, payload),
    onSuccess: () => invalidateFor(client, 'repayment'),
  })
}

export function useLinkCardRefund() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, scheduleId, payload }: { cardId: UUID; scheduleId: UUID; payload: RefundAllocationDto }) => cardsApi.linkRefund(cardId, scheduleId, payload),
    onSuccess: () => invalidateFor(client, 'refund'),
  })
}

export function useFundCardReserve() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, scheduleId, payload }: { cardId: UUID; scheduleId: UUID; payload: ReserveDto }) => cardsApi.fundReserve(cardId, scheduleId, payload),
    onSuccess: () => invalidateFor(client, 'card-reserve'),
  })
}
