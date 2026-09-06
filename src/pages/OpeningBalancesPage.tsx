import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOpeningBalances, useSaveOpeningBalance } from '@/api/hooks/openingBalances'
import { normalizeApiError } from '@/api/errors'
import type { AccountType, OpeningBalance } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Alert, Spinner } from '@/components/ui/Feedback'

const accounts = ['cash', 'bank'] as const
const label = (account: AccountType) => account === 'cash' ? 'Cash' : 'Bank'
const inputClass = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2'
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export function OpeningBalancesForm({ balances }: { balances: OpeningBalance[] }) {
  const [values, setValues] = useState(() => Object.fromEntries(accounts.map((account) => {
    const row = balances.find((item) => item.account_type === account)
    return [account, { amount: row ? String(row.amount) : '', date: row?.as_of_date ?? '' }]
  })) as Record<AccountType, { amount: string; date: string }>)
  const [errors, setErrors] = useState<string[]>([])
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }[]>([])
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const mutation = useSaveOpeningBalance()
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy.current) return
    const selected = accounts.filter((account) => values[account].amount !== '' || values[account].date !== '')
    const problems: string[] = []
    if (!selected.length) problems.push('Enter an amount and an As of date for at least one account.')
    for (const account of selected) {
      const value = values[account]
      if (!/^\d+$/.test(value.amount) || !Number.isSafeInteger(Number(value.amount))) problems.push(`${label(account)} amount must be zero or a positive whole number of yen.`)
      if (!validDate(value.date)) problems.push(`${label(account)} As of date must be a valid date.`)
    }
    setErrors(problems); setFeedback([])
    if (problems.length) return
    busy.current = true; setSaving(true)
    const results = await Promise.all(selected.map(async (account) => {
      try {
        await mutation.mutateAsync({ account, payload: { amount: Number(values[account].amount), as_of_date: values[account].date } })
        return { text: `${label(account)} opening balance saved.`, error: false }
      } catch (error) { return { text: `${label(account)} was not updated. ${normalizeApiError(error).message}`, error: true } }
    }))
    setFeedback(results); busy.current = false; setSaving(false)
  }
  const fieldError = (account: AccountType, field: 'amount' | 'date') => {
    const index = errors.findIndex((error) => error.startsWith(`${label(account)} ${field === 'amount' ? 'amount' : 'As of date'}`))
    return index < 0 ? undefined : `opening-error-${index}`
  }
  return <form onSubmit={submit} noValidate className="space-y-5">
    <p className="text-sm text-slate-600">These amounts are your starting point, not income. Leave an unconfigured account blank to save only the other account. Zero is a valid starting amount.</p>
    <Alert tone="info">Changing an amount or date recalculates historical and current balances. Choose a baseline before the transactions you plan to track.</Alert>
    {errors.length > 0 && <Alert><ul>{errors.map((error) => <li id={`opening-error-${errors.indexOf(error)}`} key={error}>{error}</li>)}</ul></Alert>}
    {feedback.map((result) => <Alert key={result.text} tone={result.error ? 'error' : 'success'}>{result.text}</Alert>)}
    <fieldset disabled={saving} className="grid gap-5 sm:grid-cols-2"><legend className="sr-only">Account starting balances</legend>{accounts.map((account) => <fieldset key={account} className="space-y-3 rounded-xl border border-slate-200 p-4"><legend className="px-1 font-semibold">{label(account)}</legend>
      <label className="block text-sm font-medium">{label(account)} amount (JPY)<input className={inputClass} inputMode="numeric" aria-invalid={Boolean(fieldError(account, 'amount'))} aria-describedby={fieldError(account, 'amount')} value={values[account].amount} onChange={(event) => setValues({ ...values, [account]: { ...values[account], amount: event.target.value } })} /></label>
      <label className="block text-sm font-medium">{label(account)} As of date<input type="date" className={inputClass} aria-invalid={Boolean(fieldError(account, 'date'))} aria-describedby={[`${account}-date-help`, fieldError(account, 'date')].filter(Boolean).join(' ')} value={values[account].date} onChange={(event) => setValues({ ...values, [account]: { ...values[account], date: event.target.value } })} /></label>
      <p id={`${account}-date-help`} className="text-xs text-slate-600">Later transactions should occur after this baseline.</p>
    </fieldset>)}</fieldset>
    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save opening balances'}</Button>
  </form>
}

export function OpeningBalancesPage() {
  const query = useOpeningBalances()
  return <section aria-labelledby="opening-heading" className="mx-auto max-w-3xl space-y-5"><h2 id="opening-heading" className="text-2xl font-bold">Opening balances</h2><Link to="/" className="inline-block text-indigo-700 underline">Back to dashboard</Link>
    {query.isLoading ? <Spinner label="Loading opening balances…" /> : query.isError ? <div className="space-y-3"><Alert>Could not load opening balances. {normalizeApiError(query.error).message}</Alert><Button onClick={() => query.refetch()}>Retry opening balances</Button></div> : <OpeningBalancesForm balances={query.data ?? []} />}
  </section>
}
