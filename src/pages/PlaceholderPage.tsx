import { EmptyState } from '@/components/ui/Feedback'

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <section aria-labelledby="page-title"><div className="mb-6"><h2 id="page-title" className="text-2xl font-bold tracking-tight text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div><EmptyState title={`No ${title.toLowerCase()} yet`} description={`Your ${title.toLowerCase()} will appear here once they are added.`} /></section>
}
