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
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut' || payload.event === 'tokenRefresh_failure') {
        setUser(null)
      }
    })

    return unsubscribe
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await amplifySignIn({ username: email, password })
    if (!result.isSignedIn) {
      throw new Error('Additional sign-in steps are required. Contact support.')
    }
    setUser(await getCurrentUser())
  }, [])

  const signOut = useCallback(async () => {
    try {
      await amplifySignOut()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: user !== null, signIn, signOut }),
    [loading, signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
