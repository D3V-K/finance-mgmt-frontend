import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/Feedback'
import { isFeatureEnabled, type LedgerFeature } from '@/config/features'

/** Renders a ledger screen only when this deployment has released its backend contract. */
export function FeatureRoute({ feature, children }: { feature: LedgerFeature; children: ReactNode }) {
  if (isFeatureEnabled(feature)) return <>{children}</>
  return <EmptyState title="Not available yet" description="This part of the finance ledger is not enabled on this deployment. Your existing Cash and Bank records are unaffected." action={<Link to="/" className="font-semibold text-indigo-700 underline">Back to dashboard</Link>} />
}
