import { createContext } from 'react'
import type { AuthUser } from 'aws-amplify/auth'

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
