import { downloadUrls, uploadUrl } from '../../sync/blob'
import { audioPath, blobEnv, MAX_AUDIO_BYTES } from '../../sync/rules'
import { clipAudioPath } from '../../sync/store'

interface Body {
  /** `put`: un URL per caricare l'audio di un clip. `get`: gli URL per scaricarne più d'uno. */
  op: 'put' | 'get'
  ids: string[]
  /** Solo per `put`: la dimensione del WAV. */
  bytes?: number
}

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const db = useDb()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database non configurato' })
  const body = (await readBody(event)) as Body
  const bad = (message: string) => createError({ statusCode: 400, statusMessage: message })
  if (!Array.isArray(body?.ids) || body.ids.length === 0 || body.ids.length > 100) {
    throw bad('ids: da 1 a 100 clip')
  }

  if (body.op === 'put') {
    const [id] = body.ids
    const bytes = Number(body.bytes)
    if (!id || body.ids.length !== 1) throw bad('put: un clip per volta')
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_AUDIO_BYTES) {
      throw bad('put: dimensione non valida')
    }
    let path: string
    try {
      path = audioPath(blobEnv(), id)
    } catch (error) {
      throw bad((error as Error).message)
    }
    return { urls: [await uploadUrl(path, bytes)] }
  }

  if (body.op === 'get') {
    // Solo i clip che sul server hanno davvero un audio (e non sono eliminati).
    const paths = await Promise.all(body.ids.map((id) => clipAudioPath(db, user.id, String(id))))
    const found = paths.map((p, i) => [body.ids[i], p] as const).filter(([, p]) => p)
    const urls = await downloadUrls(found.map(([, p]) => p as string))
    return { urls: Object.fromEntries(found.map(([id], i) => [id, urls[i]])) }
  }

  throw bad('op: put o get')
})
