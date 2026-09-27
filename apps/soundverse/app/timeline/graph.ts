import type { Voice } from '~/audio/render'
import {
  buildReturns,
  buildStrip,
  defaultReturns,
  effectiveGain,
  mixOf,
  updateReturns,
  updateStrip,
  type ReturnNodes,
  type StripNodes,
} from '~/mixer/mixer'
import {
  blockLength,
  fadeEvents,
  projectEnd,
  schedulePlays,
  type Durations,
  type TimelineProject,
} from './model'

/**
 * I nodi di volume di una sessione, per id (mai per posizione: togliendo un clip mentre suona
 * gli indici si sfalserebbero, come succedeva in Bragi). Servono a regolare i volumi dal vivo.
 */
export interface GainRegistry {
  master: GainNode | null
  tracks: Map<string, GainNode>
  placements: Map<string, GainNode>
  strips: Map<string, StripNodes>
  returns: ReturnNodes | null
}

export const emptyRegistry = (): GainRegistry => ({
  master: null,
  tracks: new Map(),
  placements: new Map(),
  strips: new Map(),
  returns: null,
})

const anySolo = (project: TimelineProject) => project.tracks.some((t) => mixOf(t.mix).solo)

/**
 * Il grafo della timeline, uguale per l'ascolto e per il render:
 * sorgente → dissolvenza (automazione) → volume del clip → volume della traccia → master → out.
 * `from` è il punto della timeline da cui si parte; `when` (nel tempo del contesto) corrisponde a `from`.
 */
export function timelineVoice(
  project: TimelineProject,
  buffers: ReadonlyMap<string, AudioBuffer>,
  from = 0,
  registry: GainRegistry = emptyRegistry(),
): Voice {
  const durations: Durations = new Map([...buffers].map(([id, b]) => [id, b.duration]))
  const end = projectEnd(project, durations)
  return {
    duration: Math.max(0, end - from),
    channels: 2,
    build(context, out, when) {
      const toContext = (t: number) => when + (t - from)

      const master = context.createGain()
      master.gain.value = project.master
      master.connect(out)
      registry.master = master
      const returns = buildReturns(context, master, project.returns ?? defaultReturns(), when)
      registry.returns = returns
      const solo = anySolo(project)

      // Ogni traccia: volume (con muto e solo) → pan → EQ → master, e dopo le mandate agli effetti.
      for (const track of project.tracks) {
        const mix = mixOf(track.mix)
        const node = context.createGain()
        node.gain.value = effectiveGain(track.gain, track.muted, mix.solo, solo)
        registry.tracks.set(track.id, node)
        registry.strips.set(track.id, buildStrip(context, node, master, mix, returns))
      }

      for (const placement of project.placements) {
        const trackNode = registry.tracks.get(placement.trackId)
        const length = blockLength(placement, durations)
        if (!trackNode || length <= 0 || placement.start + length <= from) continue

        const clipGain = context.createGain()
        clipGain.gain.value = placement.gain
        clipGain.connect(trackNode)
        registry.placements.set(placement.id, clipGain)

        const fade = context.createGain()
        fade.connect(clipGain)
        for (const event of fadeEvents(placement, length, from)) {
          const time = toContext(event.time)
          if (event.kind === 'set') fade.gain.setValueAtTime(event.value, time)
          else fade.gain.linearRampToValueAtTime(event.value, time)
        }

        for (const play of schedulePlays(
          { ...project, placements: [placement] },
          durations,
          from,
        )) {
          const buffer = buffers.get(play.clipId)
          if (!buffer) continue
          const source = context.createBufferSource()
          source.buffer = buffer
          source.connect(fade)
          source.start(toContext(play.at), play.offset, play.duration)
        }
      }
    },
  }
}

/** Applica al grafo che sta suonando i volumi attuali del progetto (fader "vivi"). */
export function applyLiveGains(registry: GainRegistry, project: TimelineProject, now: number) {
  const smooth = 0.01
  registry.master?.gain.setTargetAtTime(project.master, now, smooth)
  const solo = anySolo(project)
  for (const track of project.tracks) {
    const mix = mixOf(track.mix)
    const value = effectiveGain(track.gain, track.muted, mix.solo, solo)
    registry.tracks.get(track.id)?.gain.setTargetAtTime(value, now, smooth)
    const strip = registry.strips.get(track.id)
    if (strip) updateStrip(strip, mix, now)
  }
  if (registry.returns) updateReturns(registry.returns, project.returns ?? defaultReturns(), now)
  for (const placement of project.placements) {
    registry.placements.get(placement.id)?.gain.setTargetAtTime(placement.gain, now, smooth)
  }
}

/** Limitatore del render: se il mix supera 0,99 di picco, lo si scala (lezione di Bragi). */
export function limitPeak(channels: Float32Array<ArrayBuffer>[], ceiling = 0.99) {
  let peak = 0
  for (const channel of channels) for (const s of channel) peak = Math.max(peak, Math.abs(s))
  if (peak <= ceiling) return channels
  const factor = ceiling / peak
  return channels.map((channel) => channel.map((s) => s * factor))
}
