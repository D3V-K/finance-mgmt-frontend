import { useMemo, useState, type FormEvent } from 'react'
import { normalizeApiError } from '@/api/errors'
import { useCategories } from '@/api/hooks/categories'
import { useCreateFinancialEvent, useReplaceFinancialEvent } from '@/api/hooks/events'
import { useIdempotencyKey, useSingleFlight } from '@/api/idempotency'
import type { AccountKind, EntryOptions, FinancialEvent, FinancialEventCreateDto } from '@/api/types'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { accountKindLabel } from '@/utils/accounts'
import { eventAccounts, eventKindLabel } from '@/utils/events'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate } from '@/utils/reporting'

import type { EventFormMode } from '@/utils/events'

export type { EventFormMode }
type Values = { amount: string; account_id: string; destination_account_id: string; category_id: string; date: string; description: string }
type Errors = Partial<Record<keyof Values | 'submit', string>>

const LIQUID: AccountKind[] = ['CASH', 'BANK', 'BROKERAGE_CASH']
const SPENDING: AccountKind[] = [...LIQUID, 'CREDIT_CARD']

const kindForMode: Record<EventFormMode, FinancialEvent['kind']> = { purchase: 'EXPENSE', income: 'INCOME', refund: 'REFUND', repayment: 'CARD_REPAYMENT', transfer: 'TRANSFER' }

const copy: Record<EventFormMode, { date: string; account: string; submit: string; done: string }> = {
  purchase: { date: 'Purchase date', account: 'Paid with', submit: 'Record purchase', done: 'Purchase recorded.' },
  income: { date: 'Date received', account: 'Received into', submit: 'Record income', done: 'Income recorded.' },
  refund: { date: 'Refund date', account: 'Refunded to', submit: 'Record refund', done: 'Refund recorded.' },
  repayment: { date: 'Payment date', account: 'Paid from', submit: 'Record card repayment', done: 'Card repayment recorded.' },
  transfer: { date: 'Transfer date', account: 'From', submit: 'Record transfer', done: 'Transfer recorded.' },
}

function initialValues(mode: EventFormMode, options: EntryOptions, original?: FinancialEvent, replacing?: boolean, defaults?: Partial<Values>): Values {
  const active = new Set(options.accounts.map((account) => account.id))
  if (replacing && original) {
    const { from, to } = eventAccounts(original)
    return { amount: String(original.amount), account_id: from?.account_id ?? '', destination_account_id: to?.account_id ?? '', category_id: original.category_id ?? '', date: original.occurred_on ?? '', description: original.description ?? '', ...defaults }
  }
  const defaultAccount = options.default_account_id && active.has(options.default_account_id) ? options.default_account_id : ''
  const originalAccount = original?.postings[0]?.account_id
  return {
    amount: '', destination_account_id: '', description: '',
    account_id: mode === 'refund' && originalAccount && active.has(originalAccount) ? originalAccount : mode === 'purchase' ? defaultAccount : '',
    category_id: mode === 'purchase' ? options.recent_category_ids.find((id) => options.categories.some((category) => category.id === id && category.type === 'expense')) ?? '' : '',
    date: options.local_today,
    ...defaults,
  }
}

/**
 * One form for every canonical entry. Each submit sends one idempotency key
 * for the exact input, so a retry after a lost response cannot record twice.
 */
export function EventForm({ mode, options, original, replacing = false, defaults, onDone, onCreated }: {
  mode: EventFormMode
  options: EntryOptions
  /** The purchase being refunded, or the entry being corrected. */
  original?: FinancialEvent
  replacing?: boolean
  defaults?: Partial<Values>
  onDone: (message?: string) => void
  onCreated?: (event: FinancialEvent) => Promise<void> | void
}) {
  const create = useCreateFinancialEvent()
  const replace = useReplaceFinancialEvent()
  const categoriesQuery = useCategories()
  const idempotency = useIdempotencyKey()
  const once = useSingleFlight()
  const [values, setValues] = useState<Values>(() => initialValues(mode, options, original, replacing, defaults))
  const [errors, setErrors] = useState<Errors>({})
  const pending = create.isPending || replace.isPending
  const text = copy[mode]
  const accounts = options.accounts
  const sourceKinds = mode === 'income' || mode === 'repayment' || mode === 'transfer' ? LIQUID : SPENDING
  const sources = accounts.filter((account) => sourceKinds.includes(account.kind))
  const destinations = accounts.filter((account) => (mode === 'repayment' ? account.kind === 'CREDIT_CARD' : LIQUID.includes(account.kind)) && account.id !== values.account_id)
  const activeCategoryIds = useMemo(() => new Set(options.categories.map((category) => category.id)), [options.categories])
  const categories = (categoriesQuery.data ?? []).filter((category) => activeCategoryIds.has(category.id))
  const selected = accounts.find((account) => account.id === values.account_id)
  const destination = accounts.find((account) => account.id === values.destination_account_id)
  const set = (field: keyof Values) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [field]: event.target.value }))
  const needsCategory = mode === 'purchase' || mode === 'income'
  const needsDestination = mode === 'repayment' || mode === 'transfer'
  const unknownOriginalDate = replacing && original?.occurred_on === null

  const payload = (): FinancialEventCreateDto => {
    const base = { kind: kindForMode[mode], amount: Number(values.amount), account_id: values.account_id, description: values.description.trim() || null, occurred_on: values.date }
    if (needsCategory) return { ...base, category_id: values.category_id }
    if (mode === 'refund') return { ...base, original_event_id: replacing ? original?.original_event_id ?? null : original?.id ?? null }
    // A movement posts on the day money actually moved.
    return { ...base, destination_account_id: values.destination_account_id, effective_date: values.date }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: Errors = {}
    if (!/^\d+$/.test(values.amount) || Number(values.amount) <= 0 || !Number.isSafeInteger(Number(values.amount))) next.amount = 'Enter a whole number of yen greater than zero.'
    if (!values.account_id) next.account_id = 'Choose an account.'
    if (needsDestination && !values.destination_account_id) next.destination_account_id = mode === 'repayment' ? 'Choose the card you paid.' : 'Choose where the money went.'
    if (needsCategory && !values.category_id) next.category_id = 'Choose a category.'
    if (!isValidISODate(values.date)) next.date = unknownOriginalDate ? 'The original purchase date is unknown. Enter the date for the corrected entry.' : 'Enter a valid date.'
    if (mode === 'refund' && original && Number(values.amount) > original.amount) next.amount = `A refund can't be more than the original ${formatJPY(original.amount)}.`
    setErrors(next)
    if (Object.keys(next).length) return
    const body = payload()
    void once(async () => {
      try {
        const idempotency_key = idempotency.keyFor({ replacing: replacing ? original?.id : null, ...body })
        const saved = replacing && original ? await replace.mutateAsync({ id: original.id, payload: { ...body, idempotency_key } }) : await create.mutateAsync({ ...body, idempotency_key })
        idempotency.reset()
        await onCreated?.(saved)
        onDone(replacing ? 'Correction recorded. The original stays in your history with a reversal.' : text.done)
      } catch (error) {
        const apiError = normalizeApiError(error)
        setErrors({ submit: apiError.kind === 'conflict' ? `${apiError.message}. Nothing new was recorded; refresh the list before trying again.` : apiError.kind === 'network' ? 'The connection failed before we heard back. Your entry is kept; submitting again will not record it twice.' : apiError.message })
      }
    })
  }

  const amount = Number(values.amount) > 0 ? formatJPY(Number(values.amount)) : 'This amount'
  const categoryName = categories.find((category) => category.id === values.category_id)?.name
  const explanation = mode === 'purchase' && selected ? (selected.kind === 'CREDIT_CARD'
    ? `${amount} counts as ${categoryName ? `${categoryName} ` : ''}spending on the purchase date and is added to what you owe on ${selected.name}. Your bank balance doesn't change until you record the repayment.`
    : `${amount} counts as ${categoryName ? `${categoryName} ` : ''}spending and comes out of ${selected.name} on the purchase date.`)
    : mode === 'repayment' ? `A repayment moves money from ${selected?.name ?? 'your bank'} to ${destination?.name ?? 'the card'}. It lowers the amount owed and is not counted as spending again.`
    : mode === 'transfer' ? 'A transfer moves your own money between accounts. It is not income or spending.'
    : mode === 'refund' && original ? `Refunds ${original.description ? `"${original.description}"` : 'the original purchase'} from ${original.occurred_on ? formatDate(original.occurred_on) : 'an unknown date'}. It reduces that category's spending.` : ''

  return <form noValidate onSubmit={submit} className="space-y-4">
    {errors.submit && <Alert>{errors.submit}</Alert>}
    {replacing && original && <Alert tone="info">The original {eventKindLabel[original.kind].toLowerCase()} stays in your history. Saving records a reversal of it and this corrected entry, linked together.</Alert>}
    <Input id="event-amount" label="Amount (JPY)" inputMode="numeric" autoFocus value={values.amount} onChange={set('amount')} error={errors.amount} />
    <Select id="event-account" label={text.account} value={values.account_id} onChange={set('account_id')} error={errors.account_id}>
      <option value="">Select an account</option>
      {sources.map((account) => <option key={account.id} value={account.id}>{account.name} · {accountKindLabel[account.kind]}</option>)}
    </Select>
    {needsDestination && <Select id="event-destination" label={mode === 'repayment' ? 'Card' : 'To'} value={values.destination_account_id} onChange={set('destination_account_id')} error={errors.destination_account_id}>
      <option value="">{mode === 'repayment' ? 'Select a card' : 'Select an account'}</option>
      {destinations.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
    </Select>}
    {needsCategory && <CategorySelect id="event-category" label="Category" categories={categories} type={mode === 'purchase' ? 'expense' : 'income'} value={values.category_id} onChange={set('category_id')} error={errors.category_id} />}
    <Input id="event-date" label={text.date} type="date" value={values.date} onChange={set('date')} error={errors.date} />
    <Input id="event-description" label="Description (optional)" maxLength={500} value={values.description} onChange={set('description')} />
    {explanation && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700" aria-live="polite">{explanation}</p>}
    <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={pending}>{replacing ? 'Save correction' : text.submit}</Button></div>
  </form>
}
