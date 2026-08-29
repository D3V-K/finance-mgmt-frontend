import {
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  type AuthUser,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { AuthContext } from '@/auth/auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const e2eMode = import.meta.env.MODE === 'e2e'
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(!e2eMode)

  useEffect(() => {
    if (e2eMode) return
    let active = true

    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [e2eMode])

  useEffect(() => {
    if (e2eMode) return
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut' || payload.event === 'tokenRefresh_failure') {
        setUser(null)
      }
    })

    return unsubscribe
  }, [e2eMode])

  const signIn = useCallback(async (email: string, password: string) => {
    if (e2eMode) {
      setUser({ username: email, userId: 'e2e-user' } as AuthUser)
      return
    }
    const result = await amplifySignIn({ username: email, password })
    if (!result.isSignedIn) {
      throw new Error('Additional sign-in steps are required. Contact support.')
    }
    setUser(await getCurrentUser())
  }, [e2eMode])

  const signOut = useCallback(async () => {
    if (e2eMode) {
      setUser(null)
      return
    }
    try {
      await amplifySignOut()
    } finally {
      setUser(null)
    }
  }, [e2eMode])

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: user !== null, signIn, signOut }),
    [loading, signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
