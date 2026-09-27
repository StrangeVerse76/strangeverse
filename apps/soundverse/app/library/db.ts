import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Clip } from './types'

interface SoundverseDB extends DBSchema {
  clips: { key: string; value: Clip }
  /** WAV a 24 bit, con la stessa chiave del clip. */
  audio: { key: string; value: Blob }
}

let database: Promise<IDBPDatabase<SoundverseDB>> | null = null

function db() {
  database ??= openDB<SoundverseDB>('soundverse', 1, {
    upgrade(upgrade) {
      upgrade.createObjectStore('clips', { keyPath: 'id' })
      upgrade.createObjectStore('audio')
    },
  })
  return database
}

export async function listClips(): Promise<Clip[]> {
  return (await db()).getAll('clips')
}

/** Salva metadati e audio insieme: o entrambi o nessuno. */
export async function saveClip(clip: Clip, audio: Blob): Promise<void> {
  const tx = (await db()).transaction(['clips', 'audio'], 'readwrite')
  await Promise.all([
    tx.objectStore('clips').put(clip),
    tx.objectStore('audio').put(audio, clip.id),
    tx.done,
  ])
}

export async function updateClip(clip: Clip): Promise<void> {
  await (await db()).put('clips', clip)
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return (await db()).get('audio', id)
}

export async function deleteClip(id: string): Promise<void> {
  const tx = (await db()).transaction(['clips', 'audio'], 'readwrite')
  await Promise.all([
    tx.objectStore('clips').delete(id),
    tx.objectStore('audio').delete(id),
    tx.done,
  ])
}
