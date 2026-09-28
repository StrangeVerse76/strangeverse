import * as schema from '@strangeverse/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { GithubProfile } from 'better-auth/social-providers'
import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

/** L'unico account GitHub che può entrare: StrangeVerse76 (ADR 0011). */
export const OWNER_GITHUB_ID = '334239257'

const PRODUCTION_URL = 'https://soundverse-strange-verse.vercel.app'

/**
 * Il profilo GitHub, ma solo se è quello di Pietro: per chiunque altro `null`, e Better Auth
 * rimanda alla pagina con l'errore senza creare nessun utente.
 */
async function ownerProfile(accessToken: string | undefined) {
  const headers = { authorization: `Bearer ${accessToken}`, 'user-agent': 'soundverse' }
  const response = await fetch('https://api.github.com/user', { headers })
  if (!response.ok) return null
  const profile = (await response.json()) as GithubProfile
  if (String(profile.id) !== OWNER_GITHUB_ID) return null
  let email = profile.email
  if (!email) {
    const emails = (await (
      await fetch('https://api.github.com/user/emails', { headers })
    ).json()) as {
      email: string
      primary: boolean
    }[]
    email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null
  }
  if (!email) return null
  return {
    user: {
      name: profile.name || profile.login,
      email,
      image: profile.avatar_url,
      emailVerified: true,
    },
    // L'id dell'account (`account.accountId`) Better Auth lo prende da qui.
    data: profile,
  }
}

function createAuth() {
  const db = useDb()
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BETTER_AUTH_SECRET } = process.env
  if (!db || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !BETTER_AUTH_SECRET) return null
  return betterAuth({
    baseURL: process.env.VERCEL_ENV === 'production' ? PRODUCTION_URL : 'http://localhost:3000',
    secret: BETTER_AUTH_SECRET,
    // neon-http non ha transazioni.
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: false }),
    socialProviders: {
      github: {
        clientId: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        getUserInfo: (tokens) => ownerProfile(tokens.accessToken),
      },
    },
    telemetry: { enabled: false },
  })
}

type Auth = NonNullable<ReturnType<typeof createAuth>>
let auth: Auth | null | undefined

/**
 * Better Auth, se l'ambiente è configurato: in produzione e in locale sì, nelle anteprime no
 * (un'app OAuth di GitHub accetta un solo indirizzo di ritorno).
 */
export function useAuth(): Auth | null {
  if (auth === undefined) auth = createAuth()
  return auth
}

/**
 * L'utente, se ha una sessione valida **e** l'account GitHub è quello di Pietro.
 * Le API della sincronizzazione passano sempre da qui: il controllo del login non basta da solo.
 */
export async function ownerOf(event: H3Event) {
  const auth = useAuth()
  const db = useDb()
  if (!auth || !db) return null
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) return null
  const [github] = await db
    .select({ accountId: schema.account.accountId })
    .from(schema.account)
    .where(and(eq(schema.account.userId, session.user.id), eq(schema.account.providerId, 'github')))
  return github?.accountId === OWNER_GITHUB_ID ? session.user : null
}

export async function requireOwner(event: H3Event) {
  const user = await ownerOf(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Accesso riservato' })
  return user
}
