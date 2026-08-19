import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/auth/useAuth'
import type { LoginLocationState } from '@/auth/routes'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

type LoginValues = z.infer<typeof loginSchema>

function friendlyAuthError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
    return 'The email or password is incorrect.'
  }
  if (name === 'UserNotConfirmedException') {
    return 'Your account has not been confirmed. Check your email or contact support.'
  }
  if (name === 'TooManyRequestsException') {
    return 'Too many attempts. Wait a moment and try again.'
  }
  if (error instanceof Error && error.message.startsWith('Additional sign-in')) {
    return error.message
  }
  return 'We could not sign you in. Please try again.'
}

export function LoginPage() {
  const { signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const submit = async ({ email, password }: LoginValues) => {
    setAuthError('')
    try {
      await signIn(email, password)
      const requestedPath = (location.state as LoginLocationState | null)?.from
      navigate(requestedPath?.startsWith('/') ? requestedPath : '/', { replace: true })
    } catch (error) {
      setAuthError(friendlyAuthError(error))
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Finance</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Access your financial workspace.</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit(submit)} noValidate>
          {authError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{authError}</div>}
          <div>
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200" {...register('email')} />
            {errors.email && <p id="email-error" className="mt-1 text-sm text-red-700">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">Password</label>
            <input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200" {...register('password')} />
            {errors.password && <p id="password-error" className="mt-1 text-sm text-red-700">{errors.password.message}</p>}
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
