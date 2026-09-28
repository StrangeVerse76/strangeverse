import { createAuthClient } from 'better-auth/vue'

/** Il client di Better Auth, sullo stesso dominio dell'app (`/api/auth`). */
export const authClient = createAuthClient()

export interface Me {
  /** false dove il login non è configurato (anteprime, CI). */
  enabled: boolean
  user: { name: string; image: string | null } | null
}
