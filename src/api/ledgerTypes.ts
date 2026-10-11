// Wire contracts for the canonical ledger rollout (backend #9–#18). Field names
// and enum values mirror finance-mgmt-backend-lite exactly. `null` money values
// mean "unknown" and must never be rendered or summed as zero.
import type { CategoryType, ISODate, ISODateTime, UUID } from '@/api/types'

export type Yen = number
/** Whole-yen amount that the server could not determine (missing opening, mapping or valuation). */
export type MaybeYen = Yen | null

// ---- Named accounts (#10) ----
export type AccountKind = 'CASH' | 'BANK' | 'CREDIT_CARD' | 'BROKERAGE_CASH'
export const LIQUID_ACCOUNT_KINDS: readonly AccountKind[] = ['CASH', 'BANK', 'BROKERAGE_CASH']

export interface Account {
  id: UUID
  user_id: UUID
  name: string
  kind: AccountKind
  currency: 'JPY'
  archived_at: ISODateTime | null
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface AccountCreateDto { name: string; kind: AccountKind; currency?: 'JPY' }
export interface AccountUpdateDto { name?: string; archived?: boolean }

/** Server-signed: card debt is negative. Opening applies at the START of as_of_date. */
export interface AccountOpening {
  id: UUID
  account_id: UUID
  amount: Yen
  as_of_date: ISODate
  revision: number
  updated_at: ISODateTime
}
export interface AccountOpeningUpsertDto { amount: Yen; as_of_date: ISODate }
export interface AccountOpeningRevision { amount: Yen; as_of_date: ISODate; revision: number; reason: string; recorded_at: ISODateTime }

export type BalanceStatus = 'complete' | 'incomplete_legacy_mapping' | 'unavailable'
export interface NamedAccountBalance {
  account: Account
  as_of_date: ISODate
  balance: MaybeYen
  /** Card only: positive amount owed derived by the server. */
  amount_owed?: MaybeYen
  /** Card only: positive overpayment derived by the server. */
  credit_balance?: MaybeYen
  status: BalanceStatus
  opening_as_of_date: ISODate | null
}

// ---- Canonical financial events (#11) ----
export type EventKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'CARD_REPAYMENT' | 'REFUND' | 'BALANCE_ADJUSTMENT'
/** known = entered as a purchase date; legacy rows keep the date quality they were migrated with. */
export type DateBasis = 'known' | 'confirmed_purchase_date' | 'legacy_recorded_date' | (string & {})

export interface Posting { account_id: UUID; delta: Yen; effective_date: ISODate }
export interface FinancialEvent {
  id: UUID
  user_id: UUID
  kind: EventKind
  amount: Yen
  currency: 'JPY'
  category_id: UUID | null
  description: string | null
  /** Purchase/occurrence date; null when a legacy record's purchase date is unknown. */
  occurred_on: ISODate | null
  date_basis: DateBasis
  recorded_at: ISODateTime
  original_event_id: UUID | null
  reverses_event_id: UUID | null
  replaces_event_id: UUID | null
  is_reversal: boolean
  postings: Posting[]
}
export interface FinancialEventCreateDto {
  kind: EventKind
  amount: Yen
  currency?: 'JPY'
  category_id?: UUID | null
  description?: string | null
  occurred_on?: ISODate | null
  effective_date?: ISODate | null
  account_id?: UUID | null
  destination_account_id?: UUID | null
  original_event_id?: UUID | null
  idempotency_key?: string
  adjustment_delta?: number | null
}
export interface FinancialEventFilter {
  page?: number
  page_size?: number
  account_id?: UUID
  category_id?: UUID
  kind?: EventKind
  from?: ISODate
  to?: ISODate
}
/** The events endpoint does not return total_pages; derive it from total/page_size. */
export interface FinancialEventPage { items: FinancialEvent[]; total: number; page: number; page_size: number }

// ---- Legacy cutover (#12) ----
export interface CutoverOpeningMapping { account_id: UUID; amount: Yen }
export interface CutoverTransactionMapping { transaction_id: UUID; account_id: UUID; effective_date: ISODate; occurred_on?: ISODate | null }
export interface CutoverTransferMapping { transfer_id: UUID; from_account_id: UUID; to_account_id: UUID; effective_date: ISODate }
export interface CutoverRequest {
  as_of_date: ISODate
  openings: CutoverOpeningMapping[]
  transactions?: CutoverTransactionMapping[]
  transfers?: CutoverTransferMapping[]
}
export interface CutoverPreview {
  as_of_date: ISODate
  legacy_transaction_count: number
  legacy_transfer_count: number
  category_sums: Record<string, Yen>
  legacy_date_min: ISODate | null
  legacy_date_max: ISODate | null
  unresolved_transaction_ids: UUID[]
  unresolved_transfer_ids: UUID[]
  unresolved_count: number
  mapped_count: number
  opening_total: Yen
  legacy_account_type_is_unverified: boolean
  purchase_date_basis: string
}
export interface CutoverConfirmation { id: UUID; as_of_date: ISODate; unresolved_count: number; status: 'confirmed' }
export interface UnresolvedLegacyRecord { source_table: 'transactions' | 'transfers'; source_id: UUID; recorded_date: ISODate; amount: Yen; category_id: UUID | null }
export interface UnresolvedLegacyRecords { as_of_date: ISODate; count: number; records: UnresolvedLegacyRecord[] }
export interface ResolutionRequest { transactions?: CutoverTransactionMapping[]; transfers?: CutoverTransferMapping[] }
export interface ResolutionPreview { as_of_date: ISODate; remaining_before: number; records: Array<{ source_table: string; source_id: UUID; status: string }>; writes: 0 }
export interface ResolutionResult { resolved: number; remaining: number; status: 'confirmed' | 'already_mapped' }

// ---- Entry options and finance settings (#14, #18) ----
export interface EntryOptions {
  local_today: ISODate
  timezone: string
  currency: 'JPY'
  default_account_id: UUID | null
  accounts: Array<{ id: UUID; name: string; kind: AccountKind }>
  /** Active categories only; archived ones never appear for new entry. */
  categories: Array<{ id: UUID; name: string; type: CategoryType }>
  recent_category_ids: UUID[]
}
export interface FinanceSettings { timezone: string; currency: 'JPY'; payday_day: number; default_account_id: UUID | null }
export interface FinanceSettingsDto { timezone: string; currency?: 'JPY'; payday_day: number; default_account_id?: UUID | null }
export interface PaydayOverrideDto { month: ISODate; actual_date: ISODate }

// ---- Cards (#13) ----
export interface CardSettings { card_id: UUID; settlement_account_id: UUID; closing_day: number; payment_day: number }
export interface CardSettingsDto { settlement_account_id: UUID; closing_day: number; payment_day: number }
export type ScheduleSource = 'estimate' | 'actual'
export type ScheduleStatus = 'planned' | 'confirmed' | 'partially_paid' | 'paid'
export interface CardSchedule {
  id: UUID
  card_id: UUID
  purchase_event_id: UUID | null
  opening_obligation: string | null
  statement_id: UUID | null
  due_date: ISODate
  principal_due: Yen
  paid: Yen
  refunded: Yen
  outstanding: Yen
  source: ScheduleSource
  status: ScheduleStatus
  funded_reserve: Yen
  unfunded: Yen
}
export interface CardScheduleCreateDto { purchase_event_id?: UUID | null; opening_obligation?: string | null; due_date: ISODate; principal_due: Yen; source?: ScheduleSource }
export interface CardScheduleUpdateDto { due_date?: ISODate; principal_due?: Yen; source?: ScheduleSource; status?: 'planned' | 'confirmed' }
/** Schedules grouped by due date. principal_due is the sum of its schedules, never an extra amount. */
export interface CardStatementGroup {
  due_date: ISODate
  principal_due: Yen
  outstanding: Yen
  funded_reserve: Yen
  schedule_ids: UUID[]
  source: ScheduleSource
  statement_id: UUID | null
  closing_on: ISODate | null
}
export interface CardStatementConfirmDto { closing_on: ISODate; due_date: ISODate; principal_confirmed: Yen; schedule_ids: UUID[] }
export interface CardStatement { id: UUID; card_id: UUID; closing_on: ISODate; due_date: ISODate; principal_confirmed: Yen; schedule_ids: UUID[]; status: 'confirmed' }
export interface PaymentAllocationDto { repayment_event_id: UUID; amount: Yen }
export interface RefundAllocationDto { refund_event_id: UUID; amount: Yen }
export interface ReserveDto { account_id: UUID; amount: Yen; as_of_date: ISODate }

// ---- Budgets, goals and buckets (#14) ----
export interface BudgetLine {
  category_id: UUID
  category_name: string
  planned: Yen
  gross_spending: Yen
  refunds: Yen
  net_spending: Yen
  remaining: Yen
}
export interface BudgetCycleSummary {
  start: ISODate
  /** The next payday; the cycle covers start <= date < end_exclusive. */
  end_exclusive: ISODate
  currency: 'JPY'
  budgets: BudgetLine[]
  unknown_purchase_date_count: number
  coverage: 'incomplete' | 'known_dates_only'
}
export interface BudgetDto { category_id: UUID; cycle_start: ISODate; planned: Yen; carryover?: 'none' }
export interface Budget { id: UUID; category_id: UUID; cycle_start: ISODate; planned: Yen; carryover: 'none' }
export interface BudgetCashAssumptionDto { category_id: UUID; cycle_start: ISODate; payment_account_id: UUID }
export interface SavingsGoal { id: UUID; name: string; target: Yen; target_date: ISODate | null }
export interface SavingsGoalDto { name: string; target: Yen; target_date?: ISODate | null }
export interface Bucket { id: UUID; name: string; target: Yen; funded: Yen; shortfall: Yen; goal_id: UUID | null }
export interface BucketDto { name: string; target: Yen; goal_id?: UUID | null }
export interface BucketUpdateDto { name?: string; target?: Yen }
/** Positive amount earmarks existing cash; negative releases it. Nothing moves between banks. */
export interface BucketFundingDto { account_id: UUID; amount: Yen; as_of_date: ISODate }
export interface BucketFundingResult { bucket_id: UUID; target: Yen; funded: Yen; shortfall: Yen }
export interface AllocationAccount { account_id: UUID; balance: MaybeYen; funded: Yen; allocatable: MaybeYen; underfunded: boolean; status: BalanceStatus }
export interface AllocationSummary { currency: 'JPY'; as_of_date: ISODate; accounts: AllocationAccount[]; buckets: Bucket[] }

// ---- Forecast and available cash (#15) ----
export type FlowCertainty = 'confirmed' | 'estimated' | 'scenario_only'
export interface ExpectedCashFlow {
  id: UUID
  account_id: UUID
  on_date: ISODate
  amount: Yen
  label: string
  recurrence: 'none' | 'monthly'
  certainty: FlowCertainty
  status: string
  matched_event_id: UUID | null
}
export interface ExpectedCashFlowDto {
  account_id: UUID
  on_date: ISODate
  amount: Yen
  label: string
  recurrence?: 'none' | 'monthly'
  certainty?: FlowCertainty
  schedule_id?: UUID | null
  budget_category_id?: UUID | null
}
export type ForecastScenario = 'baseline' | 'with_scenario'
export interface ForecastMovement { amount: Yen; source: 'expected' | 'card_schedule' | 'actual' | 'unspent_budget_assumption'; label: string; certainty: string; id: UUID }
export interface ForecastDay {
  account_id: UUID
  date: ISODate
  start_balance: MaybeYen
  end_balance: MaybeYen
  movements: ForecastMovement[]
  intraday_order_uncertain: boolean
  shortfall: boolean
  coverage: BalanceStatus
}
export interface CashForecast {
  from: ISODate
  to: ISODate
  currency: 'JPY'
  scenario: ForecastScenario
  days: ForecastDay[]
  lowest_by_account: Record<UUID, { balance: Yen; date: ISODate }>
  coverage: 'incomplete' | 'partial_assumptions'
  warnings: string[]
  assumptions: string[]
}
export interface AvailableCashAccount {
  account_id: UUID
  liquid_balance: MaybeYen
  funded_earmarks: Yen
  unfunded_known_due: Yen
  raw_available: MaybeYen
  spendable: MaybeYen
  reserve_shortfall: Yen
  coverage: BalanceStatus
}
export interface AvailableCash {
  as_of_date: ISODate
  horizon: ISODate
  currency: 'JPY'
  accounts: AvailableCashAccount[]
  remaining_discretionary_budget: MaybeYen
  discretionary_budget_basis: string
  coverage: 'complete' | 'incomplete'
  warnings: string[]
}

// ---- Investments and financial position (#16) ----
export interface Valuation { id: UUID; account_id?: UUID; as_of_date: ISODate; market_value: Yen; scope: 'securities_only'; source: 'manual' }
export interface ValuationDto { as_of_date: ISODate; market_value: Yen; scope?: 'securities_only'; source?: 'manual' }
export interface HoldingsChangeDto { occurred_on: ISODate; note: string; user_entered_realized_gain?: number | null }
export interface HoldingsChange extends HoldingsChangeDto { id: UUID; account_id: UUID }
export type SecuritiesStatus = 'recorded' | 'stale_after_holdings_change' | 'missing'
export interface PositionAccount {
  account_id: UUID
  name: string
  kind: AccountKind
  balance: MaybeYen
  status: BalanceStatus
  securities: { value: MaybeYen; as_of_date: ISODate | null; scope: 'securities_only'; status: SecuritiesStatus } | null
}
export interface FinancialPosition {
  as_of_date: ISODate
  currency: 'JPY'
  liquid_cash: MaybeYen
  brokerage_cash: MaybeYen
  securities_value: MaybeYen
  /** Signed sum of card balances: negative when owed. */
  signed_card_balances: MaybeYen
  net_worth: MaybeYen
  coverage: 'complete' | 'incomplete'
  accounts: PositionAccount[]
  cumulative_contributions: Yen
  cumulative_withdrawals: Yen
  user_entered_realized_gain: Yen
  investment_return: null
  valuation_change: MaybeYen
  valuation_change_basis: string
  assumptions: string[]
}

// ---- Canonical reports (#11) ----
export interface CanonicalMonthlyReport { month: ISODate; income: Yen; gross_spending: Yen; refunds: Yen; net_spending: Yen; date_basis: 'known_only' }
export interface CanonicalCategoryReport { category_id: UUID; category_name: string; gross_spending: Yen; refunds: Yen; net_spending: Yen; date_basis: 'known_only' }

// ---- Reconciliation and data quality (#17) ----
export interface StatementBalance { account_id: UUID; from: ISODate; to: ISODate; opening: MaybeYen; closing: MaybeYen; postings: Array<{ id: UUID; amount: Yen; effective_date: ISODate }>; coverage: BalanceStatus }
export interface ReconciliationDto {
  account_id: UUID
  period_start: ISODate
  period_end: ISODate
  /** Server-signed: card statements are negative when money is owed. */
  statement_opening: Yen
  statement_closing: Yen
  selected_posting_ids?: UUID[] | null
}
export type ReconciliationStatus = 'draft' | 'confirmed' | 'stale'
export interface Reconciliation {
  id: UUID
  account_id: UUID
  period_start: ISODate
  period_end: ISODate
  statement_opening: Yen
  statement_closing: Yen
  calculated_closing: Yen
  all_postings_closing: Yen
  difference: Yen
  baseline_before_period: MaybeYen
  opening_mismatch: boolean
  selected_posting_ids: UUID[]
  unmatched_postings: Array<{ id: UUID; delta: Yen; effective_date: ISODate }>
  status: ReconciliationStatus
  captured_at: ISODateTime
  suggestions: string[]
}
export interface LedgerQuality {
  unknown_purchase_dates: number
  /** null until a cutover is confirmed. */
  unresolved_legacy_records: number | null
  missing_openings: UUID[]
  stale_or_missing_valuations: UUID[]
  unreconciled_sessions: UUID[]
  accounts_without_confirmed_statement: UUID[]
  reserve_shortfall: Yen
  schedule_debt_mismatch: Array<{ card_id: UUID; amount_owed: Yen; scheduled_outstanding: Yen }>
  balance_adjustments: number
}
/** Bounded, user-scoped JSON export owned by the server. */
export type LedgerExport = { format: 'finance-ledger-v1' } & Record<string, unknown>

// ---- Dashboard aggregate (#18) ----
export interface UpcomingWithdrawal extends ForecastMovement { account_id: UUID; date: ISODate }
export interface Dashboard {
  as_of_date: ISODate
  currency: 'JPY'
  basis: 'canonical_accounts_only'
  cycle: { start: ISODate; end_exclusive: ISODate }
  cash_by_account: AvailableCashAccount[]
  available_cash: AvailableCash
  living_budget: BudgetCycleSummary
  upcoming_withdrawals: UpcomingWithdrawal[]
  lowest_projected_balance_by_account: Record<UUID, { balance: Yen; date: ISODate }>
  forecast_assumptions: string[]
  forecast_coverage: CashForecast['coverage']
  buckets: Bucket[]
  reserve_funding_shortfall: Yen
  financial_position: FinancialPosition
  data_quality: LedgerQuality
  warnings: string[]
}
