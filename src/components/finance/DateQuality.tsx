import type { DateBasis, ISODate } from '@/api/types'
import { StatusBadge } from '@/components/finance/Amount'
import { formatDate } from '@/utils/format'

/**
 * Purchase dates are shown with their quality. A legacy record may only carry
 * the date money left the bank; that date is never presented as a purchase date.
 */
export function DateQualityBadge({ occurredOn, basis }: { occurredOn: ISODate | null; basis: DateBasis }) {
  if (occurredOn === null) return <StatusBadge tone="warn">Purchase date unknown</StatusBadge>
  if (basis === 'legacy_recorded_date') return <StatusBadge tone="warn">Recorded on payment date</StatusBadge>
  if (basis === 'confirmed_purchase_date') return <StatusBadge tone="muted">Purchase date confirmed later</StatusBadge>
  return null
}

export function PurchaseDate({ occurredOn, basis }: { occurredOn: ISODate | null; basis: DateBasis }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5">{occurredOn ? formatDate(occurredOn) : <span className="text-slate-500">—</span>}<DateQualityBadge occurredOn={occurredOn} basis={basis} /></span>
}
