/** Se il login è attivo in questo ambiente e, se sì, chi è entrato. */
export default defineEventHandler(async (event) => {
  if (!useAuth()) return { enabled: false, user: null }
  const user = await ownerOf(event)
  return { enabled: true, user: user && { name: user.name, image: user.image ?? null } }
})
