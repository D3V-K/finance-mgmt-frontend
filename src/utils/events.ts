import type { Account, EventKind, FinancialEvent } from '@/api/types'

export type EventFormMode = 'purchase' | 'income' | 'refund' | 'repayment' | 'transfer'

const modeForKind: Partial<Record<EventKind, EventFormMode>> = { EXPENSE: 'purchase', INCOME: 'income', REFUND: 'refund', CARD_REPAYMENT: 'repayment', TRANSFER: 'transfer' }

/** Which entry form can correct an event; balance adjustments can only be reversed. */
export function modeForEvent(event: FinancialEvent) {
  return modeForKind[event.kind]
}

export const eventKindLabel: Record<EventKind, string> = {
  EXPENSE: 'Purchase', INCOME: 'Income', REFUND: 'Refund', CARD_REPAYMENT: 'Card repayment', TRANSFER: 'Transfer', BALANCE_ADJUSTMENT: 'Balance adjustment',
}

/** Movements between your own accounts are never spending or income. */
export const isMovement = (kind: EventKind) => kind === 'TRANSFER' || kind === 'CARD_REPAYMENT'

/** The account that money left (or was charged to) and, for movements, the account it reached. */
export function eventAccounts(event: FinancialEvent) {
  const from = event.postings.find((posting) => posting.delta < 0) ?? event.postings[0]
  const to = event.postings.length > 1 ? event.postings.find((posting) => posting !== from) : undefined
  return { from, to }
}

/** When the money actually moved on the account, which can differ from the purchase date. */
export function postedDate(event: FinancialEvent) {
  return event.postings[0]?.effective_date ?? null
}

export function describeAccounts(event: FinancialEvent, accounts: Map<string, Pick<Account, 'name'>>) {
  const name = (id: string | undefined) => (id ? accounts.get(id)?.name : undefined) ?? 'Unknown account'
  const { from, to } = eventAccounts(event)
  if (isMovement(event.kind) && to) return `${name(from?.account_id)} → ${name(to.account_id)}`
  return name(event.postings[0]?.account_id)
}

/** Spending shows as negative, income and refunds as positive; movements are unsigned. */
export function signedEventAmount(event: FinancialEvent) {
  const direction = event.kind === 'EXPENSE' ? -1 : event.kind === 'INCOME' || event.kind === 'REFUND' ? 1 : event.kind === 'BALANCE_ADJUSTMENT' ? Math.sign(event.postings[0]?.delta ?? 1) : 0
  return { direction: event.is_reversal ? -direction : direction, amount: event.amount }
}
