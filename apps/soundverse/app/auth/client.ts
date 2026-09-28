import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/vue'

/** Il client di Better Auth, sullo stesso dominio dell'app (`/api/auth`), con le passkey. */
export const authClient = createAuthClient({ plugins: [passkeyClient()] })

export interface Me {
  /** false dove il login non è configurato (anteprime, CI). */
  enabled: boolean
  user: { name: string; image: string | null; passkeys: number } | null
}
