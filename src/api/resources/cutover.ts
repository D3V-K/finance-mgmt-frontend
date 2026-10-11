import { apiClient } from '@/api/client'
import type { CutoverConfirmation, CutoverPreview, CutoverRequest, ResolutionPreview, ResolutionRequest, ResolutionResult, UnresolvedLegacyRecords } from '@/api/types'
import { requireFeature } from '@/config/features'

export const cutoverApi = {
  /** Read-only: the server validates and summarizes without writing anything. */
  async preview(payload: CutoverRequest) { requireFeature('cutover'); return (await apiClient.post<CutoverPreview>('/ledger-cutovers/preview', payload)).data },
  /** Idempotent by request content: resubmitting identical data returns the existing cutover. */
  async confirm(payload: CutoverRequest) { requireFeature('cutover'); return (await apiClient.post<CutoverConfirmation>('/ledger-cutovers/confirm', payload)).data },
  /** Resolves null before any cutover exists (the server answers 404). */
  async unresolved() {
    requireFeature('cutover')
    try { return (await apiClient.get<UnresolvedLegacyRecords>('/ledger-cutovers/unresolved')).data }
    catch (error) { if ((error as { kind?: string }).kind === 'not-found') return null; throw error }
  },
  async previewResolution(payload: ResolutionRequest) { requireFeature('cutover'); return (await apiClient.post<ResolutionPreview>('/ledger-cutovers/resolve/preview', payload)).data },
  async confirmResolution(payload: ResolutionRequest) { requireFeature('cutover'); return (await apiClient.post<ResolutionResult>('/ledger-cutovers/resolve/confirm', payload)).data },
}
