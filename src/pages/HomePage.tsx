export function HomePage() {
  const stats = [
    { label: 'Total balance', value: '—', note: 'Across all accounts' },
    { label: 'Income', value: '—', note: 'This month' },
    { label: 'Expenses', value: '—', note: 'This month' },
  ]
  return (
    <section aria-labelledby="dashboard-heading">
      <div><h2 id="dashboard-heading" className="text-2xl font-bold tracking-tight text-slate-950">Overview</h2><p className="mt-1 text-sm text-slate-600">A quick look at your financial activity.</p></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{stats.map((stat) => <article key={stat.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-600">{stat.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{stat.value}</p><p className="mt-1 text-xs text-slate-500">{stat.note}</p></article>)}</div>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><h3 className="font-semibold">Your financial workspace is ready.</h3><p className="mt-2 text-sm text-slate-600">Your latest activity and insights will appear here as data is added.</p></div>
    </section>
  )
}
