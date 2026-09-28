import { SAMPLE_RATE } from '~/audio/constants'
import { bufferToChannels } from '~/audio/decode'
import { renderOffline } from '~/audio/render'
import { progressionVoice } from '~/chords/progression'
import { foldTail, patternLength, patternVoice } from '~/drums/pattern'
import { padPatternVoice, patternSeconds } from '~/pads/render'
import { applyChain } from '~/samples/ops'
import { synthVoice } from '~/synth/graph'
import { limitPeak, timelineVoice } from '~/timeline/graph'
import type { ClipRecipe } from './types'

type Channels = Float32Array<ArrayBuffer>[]

/** Da dove prendere l'audio dei clip da cui dipende una ricetta (sorgenti, blocchi, pad). */
export type BufferSource = (id: string) => Promise<AudioBuffer | undefined>

/** Le ricette che non si possono rifare: il loro audio viene da fuori (file, microfono). */
export const isRenderable = (recipe: ClipRecipe) =>
  recipe.type !== 'import' && recipe.type !== 'recording'

/** Gli id dei clip di cui una ricetta ha bisogno: su un altro dispositivo vanno rifatti prima di lei. */
export function recipeSources(recipe: ClipRecipe): string[] {
  switch (recipe.type) {
    case 'sample':
      return [recipe.sourceId]
    case 'mix':
      return [...new Set(recipe.project.placements.map((p) => p.clipId))]
    case 'padPattern':
      return [
        ...new Set(
          recipe.pattern.events
            .map((e) => recipe.pads[e.pad]?.clipId)
            .filter((id): id is string => !!id),
        ),
      ]
    default:
      return []
  }
}

async function loadBuffers(ids: string[], source: BufferSource) {
  const entries = await Promise.all(ids.map(async (id) => [id, await source(id)] as const))
  return new Map(entries.filter((e): e is [string, AudioBuffer] => !!e[1]))
}

/**
 * L'audio di una ricetta. È l'unica implementazione: la usano i pannelli quando salvano e la
 * sincronizzazione quando rifà un clip su un altro dispositivo, così il risultato è lo stesso.
 */
export async function renderRecipe(recipe: ClipRecipe, source: BufferSource): Promise<Channels> {
  switch (recipe.type) {
    case 'synth':
      return bufferToChannels(await renderOffline(synthVoice(recipe.spec))) as Channels
    case 'chords':
      return bufferToChannels(await renderOffline(progressionVoice(recipe.spec))) as Channels
    case 'drums': {
      const rendered = await renderOffline(patternVoice(recipe.pattern))
      const length = Math.round(patternLength(recipe.pattern) * SAMPLE_RATE)
      return [foldTail(rendered.getChannelData(0), length)]
    }
    case 'padPattern': {
      const buffers = await loadBuffers(recipeSources(recipe), source)
      const { pattern, settings, pads, mixer } = recipe
      const rendered = await renderOffline(padPatternVoice(pattern, settings, pads, buffers, mixer))
      const frames = Math.round(patternSeconds(pattern, settings) * SAMPLE_RATE)
      return [0, 1].map((c) => foldTail(rendered.getChannelData(c), frames))
    }
    case 'mix': {
      const buffers = await loadBuffers(recipeSources(recipe), source)
      const channels = bufferToChannels(
        await renderOffline(timelineVoice(recipe.project, buffers, 0)),
      ) as Channels
      // Gli stem non passano dal limitatore: i livelli relativi restano quelli del mix.
      return recipe.stem ? channels : limitPeak(channels)
    }
    case 'sample': {
      const buffer = await source(recipe.sourceId)
      if (!buffer) throw new Error(`Manca la sorgente ${recipe.sourceName}`)
      return (await applyChain(bufferToChannels(buffer), recipe.ops)) as Channels
    }
    case 'import':
    case 'recording':
      throw new Error('Questo clip non ha una ricetta da rifare')
  }
}
