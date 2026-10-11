import { Link } from 'react-router-dom'
import { useCutoverStatus } from '@/api/hooks/cutover'
import { isFeatureEnabled } from '@/config/features'
import { formatDate } from '@/utils/format'

/** Setup call-to-action until migration is confirmed, then a reminder while records remain unassigned. */
export function MigrationNotice() {
  // Legacy-only deployments never mount the ledger query.
  return isFeatureEnabled('cutover') ? <CutoverNotice /> : null
}

function CutoverNotice() {
  const status = useCutoverStatus()
  if (status.isLoading || status.isError) return null
  if (status.data === null) return <section aria-labelledby="migration-cta" className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
    <h3 id="migration-cta" className="font-semibold text-indigo-950">Record purchases on the day you buy</h3>
    <p className="mt-1 text-sm text-indigo-900">Set up your accounts and choose a start date. Your earlier Cash/Bank history stays exactly as it is.</p>
    <Link to="/setup/migration" className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">Start setup</Link>
  </section>
  if (!status.data || status.data.count === 0) return null
  return <section aria-labelledby="mapping-heading" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
    <h3 id="mapping-heading" className="font-semibold text-amber-950">Earlier records still need an account</h3>
    <p className="mt-1 text-sm text-amber-900">{status.data.count} {status.data.count === 1 ? 'record' : 'records'} from your Cash/Bank history after {formatDate(status.data.as_of_date)} {status.data.count === 1 ? 'is' : 'are'} not assigned to a named account yet. Balances that depend on {status.data.count === 1 ? 'it' : 'them'} are marked incomplete.</p>
    <Link to="/setup/migration" className="mt-2 inline-block text-sm font-semibold text-amber-950 underline">Review and assign</Link>
  </section>
}
