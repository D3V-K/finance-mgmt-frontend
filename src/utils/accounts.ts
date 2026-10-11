import type { AccountKind, MaybeYen } from '@/api/types'

export const ACCOUNT_KINDS: readonly AccountKind[] = ['BANK', 'CASH', 'CREDIT_CARD', 'BROKERAGE_CASH']

export const accountKindLabel: Record<AccountKind, string> = {
  BANK: 'Bank account', CASH: 'Cash', CREDIT_CARD: 'Credit card', BROKERAGE_CASH: 'Brokerage cash',
}

export const accountKindGroupLabel: Record<AccountKind, string> = {
  BANK: 'Bank accounts', CASH: 'Cash', CREDIT_CARD: 'Credit cards', BROKERAGE_CASH: 'Brokerage cash',
}

// The server stores card balances signed (negative when money is owed). People
// enter and read positive "Amount owed" or "Credit balance" figures instead.
export type CardBalanceSide = 'owed' | 'credit'

export function cardAmountToSigned(amount: number, side: CardBalanceSide) {
  return side === 'owed' ? -amount : amount
}

export function signedToCardAmount(signed: number): { side: CardBalanceSide; amount: number } {
  return signed <= 0 ? { side: 'owed', amount: -signed } : { side: 'credit', amount: signed }
}

/** Splits a signed card balance for display; unknown stays unknown. */
export function cardBalanceParts(signed: MaybeYen) {
  if (signed === null) return null
  return { owed: Math.max(0, -signed), credit: Math.max(0, signed) }
}
