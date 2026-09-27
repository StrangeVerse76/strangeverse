import { SAMPLE_RATE } from './constants'
import type { Mp3Bitrate } from './mp3-core'

/**
 * Codifica in MP3 in un Worker, così l'interfaccia non si blocca sui clip lunghi.
 * L'encoder (LGPL) vive solo nel chunk del Worker: vedi ADR 0010.
 */
export function encodeMp3(
  channels: readonly Float32Array[],
  kbps: Mp3Bitrate,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as
        { type: 'progress'; fraction: number } | { type: 'done'; chunks: Uint8Array<ArrayBuffer>[] }
      if (message.type === 'progress') {
        onProgress?.(message.fraction)
      } else {
        worker.terminate()
        resolve(new Blob(message.chunks, { type: 'audio/mpeg' }))
      }
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message))
    }
    const copies = channels.map((c) => Float32Array.from(c))
    worker.postMessage(
      { channels: copies, sampleRate: SAMPLE_RATE, kbps },
      copies.map((c) => c.buffer),
    )
  })
}
