// Ledger capabilities are released by the backend in stages. The backend has no
// discovery endpoint, so each deployment declares what it supports through one
// build-time flag. Nothing here reacts to 401/403/network errors: an unavailable
// feature is a deployment decision, never an inferred fallback.
export const LEDGER_FEATURES = [
  'accounts', // named accounts, per-account openings, finance settings, entry options
  'events', // canonical purchases, income, refunds, repayments, corrections
  'cutover', // legacy payment-date history migration
  'category-archive', // archive/restore and history-protecting category rules
  'cards', // card settings, schedules, statements and reserves
  'budgets', // payday budgets, savings goals and allocation buckets
  'forecast', // dated cash forecast and available-cash report
  'dashboard', // aggregated payday dashboard
  'investments', // manual valuations and financial position
  'reconciliation', // statement reconciliation, data-quality review and export
] as const

export type LedgerFeature = (typeof LEDGER_FEATURES)[number]
export type RolloutMode = 'legacy' | 'partial' | 'full'

export function parseFeatures(raw: string | undefined): Set<LedgerFeature> {
  const values = (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  if (values.includes('all')) return new Set(LEDGER_FEATURES)
  return new Set(values.filter((value): value is LedgerFeature => (LEDGER_FEATURES as readonly string[]).includes(value)))
}

let enabled = parseFeatures(import.meta.env.VITE_LEDGER_FEATURES)

export function isFeatureEnabled(feature: LedgerFeature) {
  return enabled.has(feature)
}

export function rolloutMode(): RolloutMode {
  if (enabled.size === 0) return 'legacy'
  return enabled.size === LEDGER_FEATURES.length ? 'full' : 'partial'
}

export class FeatureDisabledError extends Error {
  constructor(public readonly feature: LedgerFeature) {
    super(`This feature is not available on this deployment yet (${feature}).`)
    this.name = 'FeatureDisabledError'
  }
}

/** Resource guard: new endpoints are never requested while their feature is off. */
export function requireFeature(feature: LedgerFeature) {
  if (!enabled.has(feature)) throw new FeatureDisabledError(feature)
}

/** Test-only override; production values come from VITE_LEDGER_FEATURES. */
export function setEnabledFeatures(features: Iterable<LedgerFeature> | 'all' | 'none') {
  enabled = features === 'all' ? new Set(LEDGER_FEATURES) : features === 'none' ? new Set() : new Set(features)
}
