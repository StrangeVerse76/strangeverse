import { passkey } from '@strangeverse/db/schema'
import { count, eq } from 'drizzle-orm'

/** Se il login è attivo in questo ambiente e, se sì, chi è entrato (e quante passkey ha). */
export default defineEventHandler(async (event) => {
  const db = useDb()
  if (!useAuth() || !db) return { enabled: false, user: null }
  const user = await ownerOf(event)
  if (!user) return { enabled: true, user: null }
  const [row] = await db.select({ n: count() }).from(passkey).where(eq(passkey.userId, user.id))
  return {
    enabled: true,
    user: { name: user.name, image: user.image ?? null, passkeys: row?.n ?? 0 },
  }
})
