import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <section className="grid min-h-[60vh] place-items-center text-center"><div><p className="text-sm font-semibold text-indigo-600">404</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h2><p className="mt-3 text-slate-600">The page you’re looking for doesn’t exist or has moved.</p><Link to="/" className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">Back to dashboard</Link></div></section>
}
