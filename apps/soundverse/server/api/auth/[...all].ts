export default defineEventHandler((event) => {
  const auth = useAuth()
  if (!auth) throw createError({ statusCode: 404, statusMessage: 'Login non attivo qui' })
  return auth.handler(toWebRequest(event))
})
