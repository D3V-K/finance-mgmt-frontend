import { useMemo, useState, type FormEvent } from 'react'
import { normalizeApiError } from '@/api/errors'
import { useAccountBalance, useAccountOpening, useAccountOpeningRevisions, useAccounts, useCreateAccount, useEntryOptions, useFinanceSettings, useSaveFinanceSettings, useSetAccountOpening, useUpdateAccount } from '@/api/hooks/accounts'
import { useSingleFlight } from '@/api/idempotency'
import type { Account, AccountKind, AccountOpening, ISODate } from '@/api/types'
import { Amount, StatusBadge } from '@/components/finance/Amount'
import { MigrationNotice } from '@/components/finance/MigrationNotice'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { ACCOUNT_KINDS, accountKindGroupLabel, accountKindLabel, cardAmountToSigned, cardBalanceParts, signedToCardAmount, type CardBalanceSide } from '@/utils/accounts'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate, tokyoToday } from '@/utils/reporting'

const WHOLE_YEN = /^\d+$/

function saveError(error: unknown) {
  const apiError = normalizeApiError(error)
  return apiError.kind === 'conflict' ? `${apiError.message}. Nothing was changed; review the account and try again.` : apiError.message
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: (message?: string) => void }) {
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const once = useSingleFlight()
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind | ''>(account?.kind ?? '')
  const [errors, setErrors] = useState<{ name?: string; kind?: string; submit?: string }>({})
  const pending = create.isPending || update.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = { name: name.trim() ? undefined : 'Enter a name you will recognize, such as the bank or card name.', kind: kind ? undefined : 'Choose what kind of account this is.' }
    setErrors(next)
    if (next.name || next.kind) return
    void once(async () => {
      try {
        if (account) await update.mutateAsync({ id: account.id, payload: { name: name.trim() } })
        else await create.mutateAsync({ name: name.trim(), kind: kind as AccountKind })
        onDone(account ? 'Account renamed.' : 'Account added. Set its opening balance next.')
      } catch (error) { setErrors({ submit: saveError(error) }) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {errors.submit && <Alert>{errors.submit}</Alert>}
    <Input id="account-name" label="Account name" autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
    {account ? <p className="text-sm text-slate-600">Type: <strong>{accountKindLabel[account.kind]}</strong>. The type can't change after an account is created.</p>
      : <Select id="account-kind" label="Account type" value={kind} onChange={(event) => setKind(event.target.value as AccountKind)} error={errors.kind}><option value="">Select a type</option>{ACCOUNT_KINDS.map((item) => <option key={item} value={item}>{accountKindLabel[item]}</option>)}</Select>}
    <p className="text-sm text-slate-600">Currency: JPY. Don't enter account or card numbers; a nickname is enough.</p>
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={pending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={pending}>{account ? 'Save name' : 'Add account'}</Button></div>
  </form>
}

function OpeningForm({ account, opening, today, onDone }: { account: Account; opening: AccountOpening | null; today: ISODate; onDone: (message?: string) => void }) {
  const save = useSetAccountOpening()
  const revisions = useAccountOpeningRevisions(opening ? account.id : undefined)
  const once = useSingleFlight()
  const isCard = account.kind === 'CREDIT_CARD'
  const initial = opening ? (isCard ? signedToCardAmount(opening.amount) : { side: 'owed' as CardBalanceSide, amount: opening.amount }) : null
  const [date, setDate] = useState(opening?.as_of_date ?? today)
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [side, setSide] = useState<CardBalanceSide>(initial?.side ?? 'owed')
  const [errors, setErrors] = useState<{ date?: string; amount?: string; submit?: string }>({})
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = {
      date: isValidISODate(date) ? undefined : 'Enter a valid date.',
      amount: WHOLE_YEN.test(amount) && Number.isSafeInteger(Number(amount)) ? undefined : 'Enter zero or a positive whole number of yen.',
    }
    setErrors(next)
    if (next.date || next.amount) return
    const value = Number(amount)
    void once(async () => {
      try {
        await save.mutateAsync({ id: account.id, payload: { as_of_date: date, amount: isCard ? cardAmountToSigned(value, side) : value } })
        onDone(`${account.name} opening balance saved.`)
      } catch (error) { setErrors({ submit: saveError(error) }) }
    })
  }
  const amountLabel = isCard ? (side === 'owed' ? 'Amount owed (JPY)' : 'Credit balance (JPY)') : 'Balance (JPY)'
  return <form noValidate onSubmit={submit} className="space-y-4">
    {errors.submit && <Alert>{errors.submit}</Alert>}
    {opening && <Alert tone="info">Correcting this baseline recalculates every balance from the new date onward. Entries dated before it are not replayed into it; they stay in your history. Revision {opening.revision} was last saved {formatDate(opening.updated_at.slice(0, 10))}.</Alert>}
    <Input id="opening-date" label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} error={errors.date} aria-describedby={['opening-date-help', errors.date ? 'opening-date-error' : ''].filter(Boolean).join(' ')} />
    <p id="opening-date-help" className="-mt-2 text-xs text-slate-600">Enter the balance at the start of this date, before anything that happened on it.</p>
    {isCard && <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">On that date, the card had</legend>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="card-side" value="owed" checked={side === 'owed'} onChange={() => setSide('owed')} />Money owed to the card company</label>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="card-side" value="credit" checked={side === 'credit'} onChange={() => setSide('credit')} />A credit balance (you overpaid)</label>
    </fieldset>}
    <Input id="opening-amount" label={amountLabel} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} error={errors.amount} />
    <p className="-mt-2 text-xs text-slate-600">Zero is a valid starting balance. An opening balance is a starting point, not income or spending.</p>
    {revisions.data && revisions.data.length > 1 && <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-medium">Earlier baselines ({revisions.data.length})</summary><ul className="mt-2 space-y-1">{revisions.data.map((row) => <li key={row.revision}>Revision {row.revision}: {formatJPY(isCard ? Math.abs(row.amount) : row.amount)}{isCard ? (row.amount < 0 ? ' owed' : row.amount > 0 ? ' credit' : '') : ''} from {formatDate(row.as_of_date)} · {row.reason.replace(/_/g, ' ')}</li>)}</ul></details>}
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={save.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={save.isPending}>Save opening balance</Button></div>
  </form>
}

function BalanceCell({ account, asOf }: { account: Account; asOf: ISODate | undefined }) {
  const balance = useAccountBalance(account.id, asOf)
  if (!asOf || balance.isLoading) return <Skeleton className="h-5 w-24" />
  if (balance.isError) return <span className="text-sm text-slate-600">Balance unavailable. <button className="underline" onClick={() => balance.refetch()}>Retry</button></span>
  const data = balance.data
  if (!data || data.balance === null) return <StatusBadge tone="warn">Opening balance needed</StatusBadge>
  const card = account.kind === 'CREDIT_CARD' ? cardBalanceParts(data.balance) : null
  return <div className="text-right">
    {card ? (card.credit > 0 ? <p className="font-semibold">Credit balance {formatJPY(card.credit)}</p> : <p className="font-semibold">Amount owed {formatJPY(card.owed)}</p>) : <p className="font-semibold"><Amount value={data.balance} /></p>}
    <p className="text-xs text-slate-500">as of {formatDate(data.as_of_date)}</p>
    {data.status === 'incomplete_legacy_mapping' && <p className="mt-1"><StatusBadge tone="warn">Earlier records not yet mapped</StatusBadge></p>}
  </div>
}

function AccountRow({ account, asOf, onRename, onOpening, onArchive }: { account: Account; asOf: ISODate | undefined; onRename: () => void; onOpening: (opening: AccountOpening | null) => void; onArchive: () => void }) {
  const opening = useAccountOpening(account.id)
  const archived = account.archived_at !== null
  return <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 font-medium">{account.name}{archived && <StatusBadge tone="muted">Archived</StatusBadge>}</p>
      <p className="mt-1 text-xs text-slate-500">{accountKindLabel[account.kind]} · {account.currency} · {opening.isLoading ? 'Checking setup…' : opening.isError ? 'Setup status unavailable' : opening.data ? `Starts ${formatDate(opening.data.as_of_date)}` : 'No opening balance yet'}</p>
    </div>
    <BalanceCell account={account} asOf={asOf} />
    <div className="flex w-full flex-wrap gap-1 sm:w-auto">
      {!archived && <Button variant="ghost" className="px-3" disabled={opening.isLoading || opening.isError} onClick={() => onOpening(opening.data ?? null)}>{opening.data ? 'Correct opening balance' : 'Set opening balance'}<span className="sr-only"> for {account.name}</span></Button>}
      <Button variant="ghost" className="px-3" onClick={onRename}>Rename<span className="sr-only"> {account.name}</span></Button>
      <Button variant="ghost" className="px-3" onClick={onArchive}>{archived ? 'Restore' : 'Archive'}<span className="sr-only"> {account.name}</span></Button>
    </div>
  </li>
}

function ArchiveConfirm({ account, onDone }: { account: Account; onDone: (message?: string) => void }) {
  const update = useUpdateAccount()
  const once = useSingleFlight()
  const [error, setError] = useState('')
  const archived = account.archived_at !== null
  const confirm = () => void once(async () => {
    setError('')
    try { await update.mutateAsync({ id: account.id, payload: { archived: !archived } }); onDone(archived ? `${account.name} restored.` : `${account.name} archived.`) }
    catch (cause) { setError(saveError(cause)) }
  })
  return <div className="space-y-4">{error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">{archived ? 'Restoring lets you record new entries with this account again.' : 'Archiving keeps every past entry and balance in your history. You will not be able to record new entries with this account until you restore it.'}</p>
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={update.isPending} onClick={() => onDone()}>Cancel</Button><Button loading={update.isPending} onClick={confirm}>{archived ? 'Restore account' : 'Archive account'}</Button></div>
  </div>
}

function Preferences({ accounts }: { accounts: Account[] }) {
  const settings = useFinanceSettings()
  const save = useSaveFinanceSettings()
  const once = useSingleFlight()
  const [choice, setChoice] = useState<string | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const active = accounts.filter((account) => account.archived_at === null)
  const value = choice ?? settings.data?.default_account_id ?? ''
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!settings.data) return
    const current = settings.data
    void once(async () => {
      setMessage(null)
      try { await save.mutateAsync({ timezone: current.timezone, payday_day: current.payday_day, default_account_id: value || null }); setMessage({ text: 'Default entry account saved.', error: false }) }
      catch (error) { setMessage({ text: saveError(error), error: true }) }
    })
  }
  return <section aria-labelledby="preferences-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 id="preferences-heading" className="font-semibold">Entry preferences</h3>
    <p className="mt-1 text-sm text-slate-600">New purchases start with this account selected. You can still pick a different account for each entry. Each card's settlement bank is set on the card itself, and salary is set as an expected payment in your forecast.</p>
    {settings.isLoading ? <Skeleton className="mt-4 h-10 w-64" /> : settings.isError ? <div className="mt-4"><Alert>Could not load preferences. {normalizeApiError(settings.error).message}</Alert></div>
      : <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        {message && <div className="w-full"><Alert tone={message.error ? 'error' : 'success'}>{message.text}</Alert></div>}
        <div className="min-w-64"><Select id="default-account" label="Default entry account" value={value} onChange={(event) => setChoice(event.target.value)}><option value="">No default (choose every time)</option>{active.map((account) => <option key={account.id} value={account.id}>{account.name} · {accountKindLabel[account.kind]}</option>)}</Select></div>
        <Button type="submit" variant="secondary" loading={save.isPending}>Save preference</Button>
      </form>}
  </section>
}

type DialogState = { type: 'create' } | { type: 'rename'; account: Account } | { type: 'opening'; account: Account; opening: AccountOpening | null } | { type: 'archive'; account: Account }

export function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false)
  const accounts = useAccounts(showArchived)
  const options = useEntryOptions()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [feedback, setFeedback] = useState('')
  const asOf = options.data?.local_today
  const today = asOf ?? tokyoToday()
  const groups = useMemo(() => ACCOUNT_KINDS.map((kind) => ({ kind, items: (accounts.data ?? []).filter((account) => account.kind === kind) })).filter((group) => group.items.length), [accounts.data])
  const close = (message?: string) => { setDialog(null); if (message) setFeedback(message) }
  const title = !dialog ? '' : dialog.type === 'create' ? 'Add account' : dialog.type === 'rename' ? 'Rename account' : dialog.type === 'opening' ? `${dialog.opening ? 'Correct' : 'Set'} opening balance · ${dialog.account.name}` : `${dialog.account.archived_at ? 'Restore' : 'Archive'} ${dialog.account.name}?`
  return <section aria-labelledby="accounts-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="accounts-heading" className="text-2xl font-bold tracking-tight">Accounts</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Every bank account, wallet, credit card and brokerage cash account you track. Each one starts from its own opening balance.</p></div><Button onClick={() => setDialog({ type: 'create' })}>Add account</Button></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    <MigrationNotice />
    <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived accounts</label>
    {options.isError && <Alert tone="info">Today's date from your settings is unavailable, so balances are not shown yet. <button className="underline" onClick={() => options.refetch()}>Retry</button></Alert>}
    {accounts.isLoading ? <div aria-label="Loading accounts" className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      : accounts.isError ? <div className="space-y-3"><Alert>Could not load accounts. {normalizeApiError(accounts.error).message}</Alert><Button variant="secondary" onClick={() => accounts.refetch()}>Try again</Button></div>
      : !groups.length ? <EmptyState title="No accounts yet" description="Add the bank accounts, cash and cards you use. Nothing is connected to your bank; you enter balances yourself." action={<Button onClick={() => setDialog({ type: 'create' })}>Add your first account</Button>} />
      : <div className="grid gap-6 xl:grid-cols-2">{groups.map(({ kind, items }) => <section key={kind} aria-labelledby={`group-${kind}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <h3 id={`group-${kind}`} className="border-b border-slate-200 px-4 py-3 font-semibold">{accountKindGroupLabel[kind]}</h3>
        <ul className="divide-y divide-slate-100">{items.map((account) => <AccountRow key={account.id} account={account} asOf={asOf} onRename={() => setDialog({ type: 'rename', account })} onOpening={(opening) => setDialog({ type: 'opening', account, opening })} onArchive={() => setDialog({ type: 'archive', account })} />)}</ul>
      </section>)}</div>}
    {accounts.data && <Preferences accounts={accounts.data} />}
    <Dialog open={dialog !== null} title={title} onClose={() => close()}>
      {dialog?.type === 'create' && <AccountForm account={null} onDone={close} />}
      {dialog?.type === 'rename' && <AccountForm account={dialog.account} onDone={close} />}
      {dialog?.type === 'opening' && <OpeningForm account={dialog.account} opening={dialog.opening} today={today} onDone={close} />}
      {dialog?.type === 'archive' && <ArchiveConfirm account={dialog.account} onDone={close} />}
    </Dialog>
  </section>
}
