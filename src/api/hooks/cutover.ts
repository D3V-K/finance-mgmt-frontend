import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { cutoverApi } from '@/api/resources/cutover'
import type { CutoverRequest, ResolutionRequest } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

/** null means no cutover has been confirmed yet. */
export function useCutoverStatus() {
  return useQuery({ queryKey: ledgerKeys.cutover.unresolved(), queryFn: cutoverApi.unresolved, enabled: isFeatureEnabled('cutover') })
}

/** A preview writes nothing, so it does not invalidate any query. */
export function useCutoverPreview() {
  return useMutation({ mutationFn: (payload: CutoverRequest) => cutoverApi.preview(payload) })
}

export function useConfirmCutover() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: CutoverRequest) => cutoverApi.confirm(payload), onSuccess: () => invalidateFor(client, 'cutover') })
}

export function useResolutionPreview() {
  return useMutation({ mutationFn: (payload: ResolutionRequest) => cutoverApi.previewResolution(payload) })
}

export function useConfirmResolution() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: ResolutionRequest) => cutoverApi.confirmResolution(payload), onSuccess: () => invalidateFor(client, 'cutover') })
}
