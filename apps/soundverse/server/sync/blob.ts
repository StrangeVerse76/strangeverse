import { del, issueSignedToken, presignUrl } from '@vercel/blob'
import { MAX_AUDIO_BYTES } from './rules'

const MINUTES = 60 * 1000

/**
 * Un URL firmato per caricare l'audio di un clip: vale 10 minuti, solo per quel percorso e al
 * massimo `bytes`. Il tipo (`audio/wav`) lo chiediamo, ma Blob oggi non lo fa rispettare.
 */
export async function uploadUrl(pathname: string, bytes: number) {
  const constraints = { allowedContentTypes: ['audio/wav'], maximumSizeInBytes: MAX_AUDIO_BYTES }
  const token = await issueSignedToken({
    pathname,
    operations: ['put'],
    validUntil: Date.now() + 10 * MINUTES,
    ...constraints,
  })
  const { presignedUrl } = await presignUrl(token, {
    operation: 'put',
    pathname,
    access: 'private',
    ...constraints,
    maximumSizeInBytes: bytes,
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return presignedUrl
}

/**
 * URL firmati per scaricare più clip con un solo token (un'operazione su Blob invece di una per
 * clip). Il token resta sul server: al browser arrivano solo gli URL, validi 30 minuti.
 */
export async function downloadUrls(pathnames: string[]) {
  const validUntil = Date.now() + 30 * MINUTES
  const token = await issueSignedToken({ pathname: '*', operations: ['get'], validUntil })
  return Promise.all(
    pathnames.map(
      async (pathname) =>
        (await presignUrl(token, { operation: 'get', pathname, access: 'private', validUntil }))
          .presignedUrl,
    ),
  )
}

/** Elimina l'audio di un clip; se non c'era, pazienza. `del` su Blob è gratuita. */
export async function removeAudio(pathname: string) {
  try {
    await del(pathname)
  } catch (error) {
    console.warn('Blob: audio non eliminato', pathname, error)
  }
}
