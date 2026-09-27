import type { ParamDef } from '~/synth/spec'

export interface TimelineTrack {
  id: string
  name: string
  /** Livello lineare, 0..1. */
  gain: number
  muted: boolean
}

/** Un clip della libreria posato sulla timeline. */
export interface Placement {
  id: string
  clipId: string
  trackId: string
  /** Secondi dall'inizio della timeline. */
  start: number
  gain: number
  /** Secondi; le dissolvenze avvolgono l'intero blocco, ripetizioni comprese. */
  fadeIn: number
  fadeOut: number
  /** Quante volte il clip si ripete di seguito (1 = una volta). */
  repeat: number
}

export interface TimelineProject {
  bpm: number
  master: number
  tracks: TimelineTrack[]
  placements: Placement[]
}

export const timelineParams = {
  bpm: { label: 'BPM', unit: '', min: 40, max: 240, step: 1, default: 120 },
  master: { label: 'Master', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  zoom: { label: 'Zoom', unit: '', min: 10, max: 200, log: true, step: 1, default: 60 },
  trackGain: { label: 'Volume', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  gain: { label: 'Volume', unit: '', min: 0, max: 2, step: 0.01, default: 1 },
  fadeIn: { label: 'Fade in', unit: 's', min: 0, max: 10, step: 0.01, default: 0 },
  fadeOut: { label: 'Fade out', unit: 's', min: 0, max: 10, step: 0.01, default: 0 },
  repeat: { label: 'Ripeti', unit: '×', min: 1, max: 64, step: 1, default: 1 },
} satisfies Record<string, ParamDef>

/** Durate dei clip della libreria, in secondi, per id. */
export type Durations = ReadonlyMap<string, number>

export const beatLength = (bpm: number) => 60 / bpm

/** Aggancia un istante al battito più vicino (mai prima di zero). */
export function snapToBeat(time: number, bpm: number): number {
  const beat = beatLength(bpm)
  return Math.max(0, Math.round(time / beat) * beat)
}

export function blockLength(placement: Placement, durations: Durations): number {
  return (durations.get(placement.clipId) ?? 0) * Math.max(1, Math.round(placement.repeat))
}

/** Fine dell'ultimo blocco: la durata del mix. */
export function projectEnd(project: TimelineProject, durations: Durations): number {
  return project.placements.reduce(
    (end, p) => Math.max(end, p.start + blockLength(p, durations)),
    0,
  )
}

/** Durate effettive delle dissolvenze: se non ci stanno nel blocco, si riducono in proporzione. */
export function fadeLengths(placement: Placement, length: number) {
  const total = placement.fadeIn + placement.fadeOut
  const factor = total > length && total > 0 ? length / total : 1
  return { fadeIn: placement.fadeIn * factor, fadeOut: placement.fadeOut * factor }
}

/** Il guadagno della dissolvenza a `t` secondi dall'inizio del blocco (0..1). */
export function fadeGainAt(placement: Placement, length: number, t: number): number {
  const { fadeIn, fadeOut } = fadeLengths(placement, length)
  if (t <= 0) return fadeIn > 0 ? 0 : 1
  if (t >= length) return fadeOut > 0 ? 0 : 1
  let gain = 1
  if (fadeIn > 0 && t < fadeIn) gain = Math.min(gain, t / fadeIn)
  if (fadeOut > 0 && t > length - fadeOut) gain = Math.min(gain, (length - t) / fadeOut)
  return gain
}

/** Un punto di automazione del guadagno, nel tempo della timeline. */
export type FadeEvent = { kind: 'set' | 'ramp'; value: number; time: number }

/**
 * Automazione della dissolvenza a partire da `from` (tempo della timeline).
 * Riprendendo a metà di una dissolvenza si parte dal valore già raggiunto, non da 0 o da 1
 * (lezione di Bragi).
 */
export function fadeEvents(placement: Placement, length: number, from: number): FadeEvent[] {
  const start = placement.start
  const end = start + length
  const { fadeIn, fadeOut } = fadeLengths(placement, length)
  const now = Math.max(from, start)
  if (now >= end) return []

  const events: FadeEvent[] = [
    { kind: 'set', value: fadeGainAt(placement, length, now - start), time: now },
  ]
  const fadeInEnd = start + fadeIn
  const fadeOutStart = end - fadeOut
  if (fadeIn > 0 && now < fadeInEnd) {
    events.push({ kind: 'ramp', value: fadeGainAt(placement, length, fadeIn), time: fadeInEnd })
  }
  if (fadeOut > 0) {
    if (now < fadeOutStart) events.push({ kind: 'set', value: 1, time: fadeOutStart })
    events.push({ kind: 'ramp', value: 0, time: end })
  }
  return events
}

/** Una ripetizione da suonare: dove (timeline), da che punto del clip e per quanto. */
export interface ScheduledPlay {
  placementId: string
  clipId: string
  /** Istante di partenza, nel tempo della timeline. */
  at: number
  /** Punto di partenza dentro il clip, in secondi. */
  offset: number
  duration: number
}

/**
 * Le ripetizioni da suonare a partire da `from`. Quelle già finite si saltano;
 * quella in corso entra a metà, con l'offset giusto.
 */
export function schedulePlays(
  project: TimelineProject,
  durations: Durations,
  from: number,
): ScheduledPlay[] {
  const plays: ScheduledPlay[] = []
  for (const placement of project.placements) {
    const clipLength = durations.get(placement.clipId) ?? 0
    if (clipLength <= 0) continue
    const repeats = Math.max(1, Math.round(placement.repeat))
    for (let k = 0; k < repeats; k++) {
      const repStart = placement.start + k * clipLength
      const repEnd = repStart + clipLength
      if (repEnd <= from) continue
      const offset = Math.max(0, from - repStart)
      plays.push({
        placementId: placement.id,
        clipId: placement.clipId,
        at: repStart + offset,
        offset,
        duration: clipLength - offset,
      })
    }
  }
  return plays
}

export function newTrack(index: number): TimelineTrack {
  return {
    id: crypto.randomUUID(),
    name: `Traccia ${index}`,
    gain: timelineParams.trackGain.default,
    muted: false,
  }
}

export function defaultProject(): TimelineProject {
  return {
    bpm: timelineParams.bpm.default,
    master: timelineParams.master.default,
    tracks: [newTrack(1), newTrack(2)],
    placements: [],
  }
}
