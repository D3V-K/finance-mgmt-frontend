import { Component, type ErrorInfo, type ReactNode } from 'react'

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Route rendering failed', error, info) }
  render() {
    if (this.state.failed) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><div><p className="text-sm font-semibold text-red-700">Something went wrong</p><h1 className="mt-2 text-2xl font-bold text-slate-950">We couldn’t display this page.</h1><p className="mt-2 text-slate-600">Refresh the page to try again.</p><button className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Refresh page</button></div></main>
    return this.props.children
  }
}
