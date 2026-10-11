import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useAccountOpenings, useAccounts, useEntryOptions, useSetAccountOpening } from '@/api/hooks/accounts'
import { useCategories } from '@/api/hooks/categories'
import { useConfirmCutover, useConfirmResolution, useCutoverPreview, useCutoverStatus, useResolutionPreview } from '@/api/hooks/cutover'
import { useLegacyRecordsSince } from '@/api/hooks/legacyRecords'
import { useLedgerExport } from '@/api/hooks/reconciliation'
import { useSingleFlight } from '@/api/idempotency'
import type { Account, AccountType, Category, CutoverPreview, CutoverRequest, CutoverTransactionMapping, CutoverTransferMapping, ISODate, ResolutionPreview, Transaction, Transfer, UnresolvedLegacyRecords } from '@/api/types'
import { StatusBadge } from '@/components/finance/Amount'
import { Button } from '@/components/ui/Button'
import { Alert, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { isFeatureEnabled } from '@/config/features'
import { accountKindLabel, cardAmountToSigned, signedToCardAmount, type CardBalanceSide } from '@/utils/accounts'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate, tokyoToday } from '@/utils/reporting'

const STEPS = ['Overview', 'Accounts', 'Start date', 'Balances', 'Recent records', 'Review'] as const
type Step = 0 | 1 | 2 | 3 | 4 | 5

type BalanceDraft = { amount: string; side: CardBalanceSide }
type TxDraft = { account_id: string; purchase_date: string }
type TransferDraft = { from_account_id: string; to_account_id: string }

const legacyLabel: Record<AccountType, string> = { cash: 'Cash', bank: 'Bank' }
const mappable = (account: Account) => account.kind === 'CASH' || account.kind === 'BANK' || account.kind === 'CREDIT_CARD'
const movable = (account: Account) => account.kind === 'CASH' || account.kind === 'BANK'

function Progress({ step }: { step: Step }) {
  return <ol className="flex flex-wrap gap-2 text-xs" aria-label="Migration steps">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={`rounded-full px-3 py-1 font-semibold ${index === step ? 'bg-indigo-600 text-white' : index < step ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>{index + 1}. {label}</li>)}</ol>
}

function StepActions({ back, next, nextLabel = 'Continue', disabled, loading }: { back?: () => void; next: () => void; nextLabel?: string; disabled?: boolean; loading?: boolean }) {
  return <div className="flex flex-wrap justify-between gap-3 pt-2">{back ? <Button variant="secondary" onClick={back} disabled={loading}>Back</Button> : <span />}<Button onClick={next} disabled={disabled} loading={loading}>{nextLabel}</Button></div>
}

/** A legacy transaction mapped to a card must carry a user-confirmed purchase date. */
function transactionMapping(row: Transaction, draft: TxDraft | undefined, accounts: Map<string, Account>): CutoverTransactionMapping | null {
  if (!draft?.account_id) return null
  const account = accounts.get(draft.account_id)
  if (account?.kind === 'CREDIT_CARD') return { transaction_id: row.id, account_id: draft.account_id, effective_date: draft.purchase_date, occurred_on: draft.purchase_date }
  return { transaction_id: row.id, account_id: draft.account_id, effective_date: row.transaction_date, occurred_on: draft.purchase_date || null }
}

function RecordMappingTable({ transactions, transfers, accounts, categories, txDrafts, transferDrafts, onTx, onTransfer, minDate, errors }: {
  transactions: Array<Pick<Transaction, 'id' | 'amount' | 'transaction_date' | 'category_id'> & Partial<Pick<Transaction, 'description' | 'account_type'>>>
  transfers: Array<Pick<Transfer, 'id' | 'amount' | 'transfer_date'> & Partial<Pick<Transfer, 'from_account' | 'description'>>>
  accounts: Account[]; categories: Map<string, Category>; txDrafts: Record<string, TxDraft>; transferDrafts: Record<string, TransferDraft>
  onTx: (id: string, draft: TxDraft) => void; onTransfer: (id: string, draft: TransferDraft) => void; minDate: ISODate; errors: Record<string, string>
}) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  return <div className="space-y-4">
    {transactions.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Income and expense records to assign</caption>
      <thead className="bg-slate-50"><tr>{['Recorded date', 'Record', 'Amount', 'Account', 'Purchase date'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{transactions.map((row) => {
        const category = categories.get(row.category_id)
        const draft = txDrafts[row.id] ?? { account_id: '', purchase_date: '' }
        const selected = accountMap.get(draft.account_id)
        const choices = accounts.filter((account) => mappable(account) && !(category?.type === 'income' && account.kind === 'CREDIT_CARD'))
        const errorId = errors[row.id] ? `map-${row.id}-error` : undefined
        return <tr key={row.id} className="align-top">
          <td className="whitespace-nowrap px-3 py-3">{formatDate(row.transaction_date)}<div className="mt-1"><StatusBadge tone="warn">Recorded on payment date</StatusBadge></div></td>
          <td className="px-3 py-3">{row.description || category?.name || 'Record'}<p className="text-xs text-slate-500">{category ? `${category.name} · ${category.type === 'income' ? 'Income' : 'Expense'}` : 'Category unavailable'}{row.account_type ? ` · recorded as ${legacyLabel[row.account_type]}` : ''}</p></td>
          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatJPY(row.amount)}</td>
          <td className="px-3 py-3"><label className="sr-only" htmlFor={`map-${row.id}`}>Account for {row.description || 'record'} on {row.transaction_date}</label><select id={`map-${row.id}`} className="min-h-10 w-full min-w-40 rounded-lg border border-slate-300 bg-white px-2" value={draft.account_id} onChange={(event) => onTx(row.id, { ...draft, account_id: event.target.value })}><option value="">Leave for later</option>{choices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></td>
          <td className="px-3 py-3"><label className="sr-only" htmlFor={`purchase-${row.id}`}>Purchase date for {row.description || 'record'}{selected?.kind === 'CREDIT_CARD' ? ' (required for cards)' : ' (optional)'}</label>
            <input id={`purchase-${row.id}`} type="date" min={minDate} className="min-h-10 rounded-lg border border-slate-300 px-2" value={draft.purchase_date} aria-invalid={Boolean(errorId)} aria-describedby={errorId} onChange={(event) => onTx(row.id, { ...draft, purchase_date: event.target.value })} />
            <p className="mt-1 text-xs text-slate-500">{selected?.kind === 'CREDIT_CARD' ? 'Required: the day you bought it.' : 'Optional. Leave blank if unknown.'}</p>
            {errorId && <p id={errorId} className="mt-1 text-xs text-red-700">{errors[row.id]}</p>}</td>
        </tr>
      })}</tbody></table></div>}
    {transfers.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Transfers to assign</caption>
      <thead className="bg-slate-50"><tr>{['Date', 'Transfer', 'Amount', 'From', 'To'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{transfers.map((row) => {
        const draft = transferDrafts[row.id] ?? { from_account_id: '', to_account_id: '' }
        const choices = accounts.filter(movable)
        return <tr key={row.id}>
          <td className="whitespace-nowrap px-3 py-3">{formatDate(row.transfer_date)}</td>
          <td className="px-3 py-3">{row.description || (row.from_account ? `${legacyLabel[row.from_account]} to ${legacyLabel[row.from_account === 'bank' ? 'cash' : 'bank']}` : 'Transfer')}{errors[row.id] && <p className="text-xs text-red-700">{errors[row.id]}</p>}</td>
          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatJPY(row.amount)}</td>
          {(['from_account_id', 'to_account_id'] as const).map((field) => <td key={field} className="px-3 py-3"><label className="sr-only" htmlFor={`${field}-${row.id}`}>{field === 'from_account_id' ? 'From' : 'To'} account for transfer on {row.transfer_date}</label><select id={`${field}-${row.id}`} className="min-h-10 w-full min-w-36 rounded-lg border border-slate-300 bg-white px-2" value={draft[field]} onChange={(event) => onTransfer(row.id, { ...draft, [field]: event.target.value })}><option value="">Leave for later</option>{choices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></td>)}
        </tr>
      })}</tbody></table></div>}
  </div>
}

function validateMappings(transactions: CutoverTransactionMapping[], transfers: Array<CutoverTransferMapping | { transfer_id: string; incomplete: true }>, accounts: Map<string, Account>, minDate: ISODate) {
  const errors: Record<string, string> = {}
  for (const mapping of transactions) {
    const card = accounts.get(mapping.account_id)?.kind === 'CREDIT_CARD'
    if (card && !isValidISODate(mapping.effective_date)) errors[mapping.transaction_id] = 'Enter the purchase date, or leave this record for later.'
    else if (mapping.occurred_on && (!isValidISODate(mapping.occurred_on) || mapping.occurred_on < minDate)) errors[mapping.transaction_id] = `Purchase date must be on or after ${formatDate(minDate)}.`
  }
  for (const mapping of transfers) {
    if ('incomplete' in mapping) errors[mapping.transfer_id] = 'Choose both accounts, or leave both for later.'
    else if (mapping.from_account_id === mapping.to_account_id) errors[mapping.transfer_id] = 'Choose two different accounts.'
  }
  return errors
}

function PreviewSummary({ preview, categories }: { preview: CutoverPreview | ResolutionPreview; categories: Map<string, Category> }) {
  if (!('legacy_transaction_count' in preview)) return null
  return <div className="space-y-4">
    <dl className="grid gap-4 sm:grid-cols-3">
      {[['Start date', formatDate(preview.as_of_date)], ['Opening balances total', formatJPY(preview.opening_total)], ['Records assigned now', String(preview.mapped_count)], ['Earlier records kept as history', `${preview.legacy_transaction_count} records, ${preview.legacy_transfer_count} transfers`], ['Left for later', String(preview.unresolved_count)], ['History dates', preview.legacy_date_min ? `${formatDate(preview.legacy_date_min)} – ${formatDate(preview.legacy_date_max!)}` : 'No earlier records']].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
    </dl>
    {Object.keys(preview.category_sums).length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="text-left font-semibold">Category totals stay exactly as recorded</caption><thead><tr><th className="py-2 text-left text-slate-500">Category</th><th className="py-2 text-right text-slate-500">Total</th></tr></thead><tbody>{Object.entries(preview.category_sums).map(([id, total]) => <tr key={id} className="border-t border-slate-100"><th scope="row" className="py-2 text-left font-medium">{categories.get(id)?.name ?? 'Unnamed category'}</th><td className="py-2 text-right">{formatJPY(total)}</td></tr>)}</tbody></table></div>}
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {preview.legacy_account_type_is_unverified && <li>Your earlier Cash/Bank labels are not proof of how you paid, so nothing was assigned to an account unless you chose it.</li>}
      <li>Purchase dates stay unknown unless you entered them. No date is guessed.</li>
      {preview.unresolved_count > 0 && <li>{preview.unresolved_count} recent {preview.unresolved_count === 1 ? 'record stays' : 'records stay'} unassigned. Balances that depend on {preview.unresolved_count === 1 ? 'it' : 'them'} are marked incomplete until you assign {preview.unresolved_count === 1 ? 'it' : 'them'} on the review page.</li>}
    </ul>
  </div>
}

function BackupButton() {
  const exportLedger = useLedgerExport()
  const [error, setError] = useState('')
  if (!isFeatureEnabled('reconciliation')) return null
  const download = async () => {
    setError('')
    try {
      const data = await exportLedger.mutateAsync()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `finance-ledger-backup-${tokyoToday()}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (cause) { setError(normalizeApiError(cause).message) }
  }
  return <div className="space-y-2">{error && <Alert>Backup failed. {error}</Alert>}<Button variant="secondary" loading={exportLedger.isPending} onClick={download}>Download a backup first</Button><p className="text-xs text-slate-500">A complete copy of your records prepared by the server, saved to your device.</p></div>
}

function MigrationWizard() {
  const accountsQuery = useAccounts(true)
  const options = useEntryOptions()
  const categoriesQuery = useCategories(true)
  const allAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const accounts = useMemo(() => allAccounts.filter((account) => account.archived_at === null), [allAccounts])
  const archived = allAccounts.filter((account) => account.archived_at !== null)
  const openings = useAccountOpenings(accounts.map((account) => account.id))
  const categories = useMemo(() => new Map((categoriesQuery.data ?? []).map((category) => [category.id, category])), [categoriesQuery.data])
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const saveOpening = useSetAccountOpening()
  const preview = useCutoverPreview()
  const confirm = useConfirmCutover()
  const status = useCutoverStatus()
  const once = useSingleFlight()

  const [step, setStep] = useState<Step>(0)
  const [legacyMap, setLegacyMap] = useState<Record<AccountType, string>>({ cash: '', bank: '' })
  const [date, setDate] = useState('')
  const [balances, setBalances] = useState<Record<string, BalanceDraft>>({})
  const [txDrafts, setTxDrafts] = useState<Record<string, TxDraft>>({})
  const [transferDrafts, setTransferDrafts] = useState<Record<string, TransferDraft>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [previewed, setPreviewed] = useState<{ request: string; result: CutoverPreview } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const records = useLegacyRecordsSince(step >= 4 && isValidISODate(date) ? date : undefined)
  const seeded = useRef(false)
  const openingsReady = openings.every((query) => !query.isLoading)

  // Resume from server state: balances already saved for every account share one start date.
  useEffect(() => {
    if (seeded.current || !accountsQuery.data || !options.data || !openingsReady) return
    seeded.current = true
    const saved = accounts.map((account, index) => ({ account, opening: openings[index]?.data ?? null }))
    const dates = new Set(saved.map((row) => row.opening?.as_of_date).filter(Boolean))
    const shared = dates.size === 1 && saved.every((row) => row.opening) ? [...dates][0]! : ''
    setDate(shared || options.data.local_today)
    setBalances(Object.fromEntries(saved.filter((row) => row.opening && (!shared || row.opening.as_of_date === shared)).map(({ account, opening }) => {
      const parts = account.kind === 'CREDIT_CARD' ? signedToCardAmount(opening!.amount) : { amount: opening!.amount, side: 'owed' as const }
      return [account.id, { amount: String(parts.amount), side: parts.side }]
    })))
    if (shared && accounts.length) setStep(4)
  }, [accounts, accountsQuery.data, openings, openingsReady, options.data])

  const legacyRows = records.data
  const buildRequest = (): { request: CutoverRequest; errors: Record<string, string> } => {
    const transactions = (legacyRows?.transactions ?? []).map((row) => transactionMapping(row, txDrafts[row.id], accountMap)).filter((value): value is CutoverTransactionMapping => value !== null)
    const transfers = (legacyRows?.transfers ?? []).flatMap((row): Array<CutoverTransferMapping | { transfer_id: string; incomplete: true }> => {
      const draft = transferDrafts[row.id]
      if (!draft || (!draft.from_account_id && !draft.to_account_id)) return []
      if (!draft.from_account_id || !draft.to_account_id) return [{ transfer_id: row.id, incomplete: true }]
      return [{ transfer_id: row.id, from_account_id: draft.from_account_id, to_account_id: draft.to_account_id, effective_date: row.transfer_date }]
    })
    const problems = validateMappings(transactions, transfers, accountMap, date)
    const openingsPayload = accounts.map((account) => ({ account_id: account.id, amount: account.kind === 'CREDIT_CARD' ? cardAmountToSigned(Number(balances[account.id]?.amount), balances[account.id]?.side ?? 'owed') : Number(balances[account.id]?.amount) }))
    return { request: { as_of_date: date, openings: openingsPayload, transactions, transfers: transfers.filter((item): item is CutoverTransferMapping => !('incomplete' in item)) }, errors: problems }
  }

  // Apply the Cash/Bank defaults chosen on the accounts step, without overriding explicit choices.
  useEffect(() => {
    if (!legacyRows) return
    setTxDrafts((current) => Object.fromEntries(legacyRows.transactions.map((row) => [row.id, current[row.id] ?? { account_id: legacyMap[row.account_type] && categories.get(row.category_id) ? legacyMap[row.account_type] : '', purchase_date: '' }])))
    setTransferDrafts((current) => Object.fromEntries(legacyRows.transfers.map((row) => [row.id, current[row.id] ?? { from_account_id: legacyMap[row.from_account], to_account_id: legacyMap[row.to_account] }])))
  }, [categories, legacyMap, legacyRows])

  const saveBalances = () => void once(async () => {
    const problems: Record<string, string> = {}
    for (const account of accounts) if (!/^\d+$/.test(balances[account.id]?.amount ?? '')) problems[account.id] = 'Enter zero or a positive whole number of yen.'
    setErrors(problems)
    if (Object.keys(problems).length) return
    setMessage('')
    const failures: string[] = []
    for (const account of accounts) {
      const draft = balances[account.id]!
      try { await saveOpening.mutateAsync({ id: account.id, payload: { as_of_date: date, amount: account.kind === 'CREDIT_CARD' ? cardAmountToSigned(Number(draft.amount), draft.side) : Number(draft.amount) } }) }
      catch (error) { failures.push(`${account.name}: ${normalizeApiError(error).message}`) }
    }
    if (failures.length) setMessage(`Some balances were not saved. ${failures.join(' ')}`)
    else setStep(4)
  })

  const runPreview = () => void once(async () => {
    const { request, errors: problems } = buildRequest()
    setErrors(problems)
    if (Object.keys(problems).length) return
    setMessage('')
    try { setPreviewed({ request: JSON.stringify(request), result: await preview.mutateAsync(request) }); setAcknowledged(false); setStep(5) }
    catch (error) { setMessage(normalizeApiError(error).message) }
  })

  const runConfirm = () => void once(async () => {
    if (!previewed) return
    setMessage('')
    try { await confirm.mutateAsync(JSON.parse(previewed.request) as CutoverRequest); setConfirmed(true) }
    catch (error) {
      const apiError = normalizeApiError(error)
      if (apiError.kind === 'network' || apiError.kind === 'server') {
        // The response may have been lost after the server finished. Check before offering a retry.
        const latest = await status.refetch()
        if (latest.data) { setConfirmed(true); return }
        setMessage('We could not confirm the migration and it has not been applied. Your choices are kept; it is safe to try again.')
      } else setMessage(apiError.kind === 'conflict' ? `${apiError.message}. Nothing was changed.` : apiError.message)
    }
  })

  if (accountsQuery.isLoading || options.isLoading || categoriesQuery.isLoading) return <div aria-label="Loading migration" className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-48" /></div>
  if (accountsQuery.isError || options.isError) return <div className="space-y-3"><Alert>Could not load your accounts. {normalizeApiError(accountsQuery.error ?? options.error).message}</Alert><Button variant="secondary" onClick={() => { accountsQuery.refetch(); options.refetch() }}>Try again</Button></div>

  const cashOrBank = accounts.filter(movable)
  const requestChanged = previewed !== null && step === 5 && JSON.stringify(buildRequest().request) !== previewed.request
  return <div className="space-y-6">
    <Progress step={step} />
    {message && <Alert>{message}</Alert>}

    {step === 0 && <section aria-labelledby="overview-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="overview-heading" className="text-lg font-semibold">Switch to recording purchases on the day you buy</h3>
      <div className="space-y-2 text-sm text-slate-700">
        <p>Until now, card purchases may have been recorded when the bank paid the card. From a start date you choose, each purchase is recorded on its purchase date and card repayments are recorded separately.</p>
        <p>Nothing in your history is deleted, rewritten or duplicated. Records before the start date stay exactly as they are and are marked as recorded on their payment date.</p>
        <p>You will pick the accounts you use, a start date, and each account's balance at the start of that date. You can preview everything before confirming.</p>
      </div>
      <StepActions next={() => setStep(1)} nextLabel="Get started" />
    </section>}

    {step === 1 && <section aria-labelledby="accounts-step" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="accounts-step" className="text-lg font-semibold">Your accounts</h3>
      {!accounts.length ? <Alert tone="info">Add at least one account first. <Link to="/accounts" className="font-semibold underline">Go to Accounts</Link></Alert>
        : <ul className="divide-y divide-slate-100 text-sm">{accounts.map((account) => <li key={account.id} className="flex justify-between py-2"><span className="font-medium">{account.name}</span><span className="text-slate-500">{accountKindLabel[account.kind]}</span></li>)}</ul>}
      {archived.length > 0 && <Alert>Archived accounts can't be included in the migration: {archived.map((account) => account.name).join(', ')}. Restore {archived.length === 1 ? 'it' : 'them'} on the <Link to="/accounts" className="underline">Accounts</Link> page first.</Alert>}
      <p className="text-sm text-slate-600">Missing an account? <Link to="/accounts" className="font-semibold text-indigo-700 underline">Add it on the Accounts page</Link>; your progress here is kept on the server.</p>
      {cashOrBank.length > 0 && <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium text-slate-700">Suggest an account for your earlier records (you can change each one later)</legend>
        {(['cash', 'bank'] as const).map((legacy) => <Select key={legacy} id={`legacy-${legacy}`} label={`Records labelled ${legacyLabel[legacy]}`} value={legacyMap[legacy]} onChange={(event) => setLegacyMap({ ...legacyMap, [legacy]: event.target.value })}><option value="">No suggestion</option>{cashOrBank.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select>)}
      </fieldset>}
      <StepActions back={() => setStep(0)} next={() => setStep(2)} disabled={!accounts.length || archived.length > 0} />
    </section>}

    {step === 2 && <section aria-labelledby="date-step" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="date-step" className="text-lg font-semibold">Choose a start date</h3>
      <Input id="cutover-date" label="Start tracking purchases on" type="date" value={date} onChange={(event) => setDate(event.target.value)} error={errors.date} aria-describedby="cutover-help" />
      <p id="cutover-help" className="text-sm text-slate-600">Balances are taken at the start of this day. Any card debt you already owe on that morning includes all older purchases, so those purchases are not added again. Choosing a date you can check against a statement makes the next steps easier.</p>
      <StepActions back={() => setStep(1)} next={() => { if (!isValidISODate(date)) { setErrors({ date: 'Enter a valid date.' }); return } setErrors({}); setStep(3) }} />
    </section>}

    {step === 3 && <section aria-labelledby="balances-step" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="balances-step" className="text-lg font-semibold">Balances at the start of {isValidISODate(date) ? formatDate(date) : 'the start date'}</h3>
      <p className="text-sm text-slate-600">Enter what each account held before anything happened that day. For cards, enter the total you owed, including purchases not yet billed. Adding repayment schedules later does not add this debt again.</p>
      <div className="grid gap-4 sm:grid-cols-2">{accounts.map((account) => {
        const draft = balances[account.id] ?? { amount: '', side: 'owed' as const }
        const set = (next: Partial<BalanceDraft>) => setBalances({ ...balances, [account.id]: { ...draft, ...next } })
        return <fieldset key={account.id} className="space-y-2 rounded-lg border border-slate-200 p-3"><legend className="px-1 font-semibold">{account.name}</legend>
          {account.kind === 'CREDIT_CARD' && <div className="flex flex-wrap gap-4 text-sm">{(['owed', 'credit'] as const).map((side) => <label key={side} className="flex min-h-10 items-center gap-2"><input type="radio" name={`side-${account.id}`} checked={draft.side === side} onChange={() => set({ side })} />{side === 'owed' ? 'Amount owed' : 'Credit balance'}</label>)}</div>}
          <Input id={`balance-${account.id}`} label={account.kind === 'CREDIT_CARD' ? `${account.name} ${draft.side === 'owed' ? 'amount owed' : 'credit balance'} (JPY)` : `${account.name} balance (JPY)`} inputMode="numeric" value={draft.amount} onChange={(event) => set({ amount: event.target.value })} error={errors[account.id]} />
        </fieldset>
      })}</div>
      <StepActions back={() => setStep(2)} next={saveBalances} nextLabel="Save balances and continue" loading={saveOpening.isPending} />
    </section>}

    {step === 4 && <section aria-labelledby="records-step" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="records-step" className="text-lg font-semibold">Records on or after {formatDate(date)}</h3>
      <p className="text-sm text-slate-600">These earlier-style records fall after your start date. Assign each one to the account it really used, or leave it for later. A record assigned to a card needs the day you bought it; card debt already counted in your opening balance should not be assigned again.</p>
      {records.isLoading ? <Skeleton className="h-32" /> : records.isError ? <div className="space-y-2"><Alert>Could not load your recent records. {normalizeApiError(records.error).message}</Alert><Button variant="secondary" onClick={() => records.refetch()}>Try again</Button></div>
        : !legacyRows?.transactions.length && !legacyRows?.transfers.length ? <Alert tone="info">There are no records on or after this date. Nothing needs assigning.</Alert>
        : <RecordMappingTable transactions={legacyRows.transactions} transfers={legacyRows.transfers} accounts={accounts} categories={categories} txDrafts={txDrafts} transferDrafts={transferDrafts} onTx={(id, draft) => setTxDrafts({ ...txDrafts, [id]: draft })} onTransfer={(id, draft) => setTransferDrafts({ ...transferDrafts, [id]: draft })} minDate={date} errors={errors} />}
      {Object.keys(errors).length > 0 && <Alert>Some records need attention before previewing.</Alert>}
      <StepActions back={() => setStep(3)} next={runPreview} nextLabel="Preview migration" loading={preview.isPending} disabled={records.isLoading || records.isError} />
    </section>}

    {step === 5 && previewed && <section aria-labelledby="review-step" className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <h3 id="review-step" className="text-lg font-semibold">Review before confirming</h3>
      <p className="text-sm text-slate-600">This preview did not change anything.</p>
      <PreviewSummary preview={previewed.result} categories={categories} />
      {requestChanged && <Alert>Your choices changed after this preview. Preview again before confirming.</Alert>}
      <BackupButton />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand that records before {formatDate(previewed.result.as_of_date)} stay as recorded history, and new purchases will be tracked by purchase date from that day.</label>
      <StepActions back={() => setStep(4)} next={runConfirm} nextLabel={confirmed ? 'Migration confirmed' : 'Confirm migration'} disabled={!acknowledged || requestChanged || confirmed} loading={confirm.isPending} />
    </section>}
  </div>
}

function MigrationReview({ status }: { status: UnresolvedLegacyRecords }) {
  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories(true)
  const previewResolution = useResolutionPreview()
  const confirmResolution = useConfirmResolution()
  const once = useSingleFlight()
  const accounts = accountsQuery.data ?? []
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categories = new Map((categoriesQuery.data ?? []).map((category) => [category.id, category]))
  const [txDrafts, setTxDrafts] = useState<Record<string, TxDraft>>({})
  const [transferDrafts, setTransferDrafts] = useState<Record<string, TransferDraft>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{ request: string; result: ResolutionPreview } | null>(null)
  const transactions = status.records.filter((row) => row.source_table === 'transactions').map((row) => ({ id: row.source_id, amount: row.amount, transaction_date: row.recorded_date, category_id: row.category_id ?? '' }))
  const transfers = status.records.filter((row) => row.source_table === 'transfers').map((row) => ({ id: row.source_id, amount: row.amount, transfer_date: row.recorded_date }))

  const build = () => {
    const txMappings = transactions.map((row) => transactionMapping(row as Transaction, txDrafts[row.id], accountMap)).filter((value): value is CutoverTransactionMapping => value !== null)
    const transferMappings = transfers.flatMap((row): Array<CutoverTransferMapping | { transfer_id: string; incomplete: true }> => {
      const draft = transferDrafts[row.id]
      if (!draft || (!draft.from_account_id && !draft.to_account_id)) return []
      if (!draft.from_account_id || !draft.to_account_id) return [{ transfer_id: row.id, incomplete: true }]
      return [{ transfer_id: row.id, from_account_id: draft.from_account_id, to_account_id: draft.to_account_id, effective_date: row.transfer_date }]
    })
    return { request: { transactions: txMappings, transfers: transferMappings.filter((item): item is CutoverTransferMapping => !('incomplete' in item)) }, problems: validateMappings(txMappings, transferMappings, accountMap, status.as_of_date) }
  }

  const review = () => void once(async () => {
    const { request, problems } = build()
    setErrors(problems)
    if (Object.keys(problems).length) return
    if (!request.transactions.length && !request.transfers.length) { setMessage({ text: 'Choose an account for at least one record.', error: true }); return }
    setMessage(null)
    try { setPendingPreview({ request: JSON.stringify(request), result: await previewResolution.mutateAsync(request) }) }
    catch (error) { setMessage({ text: normalizeApiError(error).message, error: true }) }
  })
  const apply = () => void once(async () => {
    if (!pendingPreview) return
    try {
      const result = await confirmResolution.mutateAsync(JSON.parse(pendingPreview.request))
      setPendingPreview(null); setTxDrafts({}); setTransferDrafts({})
      setMessage({ text: result.status === 'already_mapped' ? 'These records were already assigned.' : `${result.resolved} ${result.resolved === 1 ? 'record' : 'records'} assigned. ${result.remaining} left.`, error: false })
    } catch (error) { setMessage({ text: normalizeApiError(error).message, error: true }) }
  })

  if (accountsQuery.isLoading || categoriesQuery.isLoading) return <Skeleton className="h-48" />
  return <div className="space-y-6">
    <section aria-labelledby="done-heading" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h3 id="done-heading" className="text-lg font-semibold text-emerald-950">Purchase-date tracking started {formatDate(status.as_of_date)}</h3>
      <p className="text-sm text-emerald-900">Records before that date remain in your history as recorded. New purchases, repayments and transfers are recorded separately from now on.</p>
    </section>
    <section aria-labelledby="reports-heading" className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
      <h3 id="reports-heading" className="font-semibold">What's complete</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Spending by purchase date for entries from {formatDate(status.as_of_date)}: available.</li>
        <li>Earlier Cash/Bank reports: still available, based on recorded dates.</li>
        <li>Account balances and forecasts: {status.count ? <strong>incomplete until the records below are assigned</strong> : 'complete'}.</li>
      </ul>
    </section>
    {message && <Alert tone={message.error ? 'error' : 'success'}>{message.text}</Alert>}
    {status.count === 0 ? <Alert tone="success">Every record after the start date is assigned to an account.</Alert> : <section aria-labelledby="unresolved-heading" className="space-y-4">
      <h3 id="unresolved-heading" className="text-lg font-semibold">{status.count} {status.count === 1 ? 'record needs' : 'records need'} an account</h3>
      <RecordMappingTable transactions={transactions} transfers={transfers} accounts={accounts} categories={categories} txDrafts={txDrafts} transferDrafts={transferDrafts} onTx={(id, draft) => { setPendingPreview(null); setTxDrafts({ ...txDrafts, [id]: draft }) }} onTransfer={(id, draft) => { setPendingPreview(null); setTransferDrafts({ ...transferDrafts, [id]: draft }) }} minDate={status.as_of_date} errors={errors} />
      {pendingPreview ? <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm">Assign {pendingPreview.result.records.length} {pendingPreview.result.records.length === 1 ? 'record' : 'records'}? This preview changed nothing.</p><div className="flex gap-3"><Button variant="secondary" onClick={() => setPendingPreview(null)}>Back</Button><Button loading={confirmResolution.isPending} onClick={apply}>Assign records</Button></div></div>
        : <Button onClick={review} loading={previewResolution.isPending}>Review assignments</Button>}
    </section>}
    <p className="text-sm"><Link to="/accounts" className="font-semibold text-indigo-700 underline">Back to accounts</Link></p>
  </div>
}

export function MigrationPage() {
  const status = useCutoverStatus()
  return <section aria-labelledby="migration-heading" className="mx-auto max-w-5xl space-y-6">
    <div><h2 id="migration-heading" className="text-2xl font-bold tracking-tight">Purchase-date tracking setup</h2><p className="mt-1 text-sm text-slate-600">Move from payment-date records to named accounts without rewriting your history.</p></div>
    {status.isLoading ? <Skeleton className="h-48" /> : status.isError ? <div className="space-y-3"><Alert>Could not check your migration status. {normalizeApiError(status.error).message}</Alert><Button variant="secondary" onClick={() => status.refetch()}>Try again</Button></div>
      : status.data ? <MigrationReview status={status.data} /> : <MigrationWizard />}
  </section>
}

