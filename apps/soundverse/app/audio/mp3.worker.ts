/// <reference lib="webworker" />
import { encodeMp3Chunks, type Mp3Bitrate } from './mp3-core'

interface Request {
  channels: Float32Array[]
  sampleRate: number
  kbps: Mp3Bitrate
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { channels, sampleRate, kbps } = event.data
  let last = 0
  const chunks = encodeMp3Chunks(channels, sampleRate, kbps, (fraction) => {
    // Pochi messaggi: uno ogni 5% basta per una barra di avanzamento.
    if (fraction - last >= 0.05 || fraction === 1) {
      last = fraction
      self.postMessage({ type: 'progress', fraction })
    }
  })
  self.postMessage(
    { type: 'done', chunks },
    chunks.map((c) => c.buffer as ArrayBuffer),
  )
}
