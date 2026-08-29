import type { AuthUser } from 'aws-amplify/auth'
import { vi } from 'vitest'

export const authenticatedUser = { username: 'test@example.com', userId: 'test-user' } as AuthUser

export function createCognitoMocks() {
  return {
    fetchAuthSession: vi.fn().mockResolvedValue({ tokens: { idToken: { toString: () => 'test-token' } } }),
    getCurrentUser: vi.fn().mockResolvedValue(authenticatedUser),
    signIn: vi.fn().mockResolvedValue({ isSignedIn: true }),
    signOut: vi.fn().mockResolvedValue(undefined),
  }
}
