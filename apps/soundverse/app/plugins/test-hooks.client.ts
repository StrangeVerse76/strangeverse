import { bufferToChannels } from '~/audio/decode'
import { isRenderable } from '~/library/recipes'
import { useLibraryStore } from '~/stores/library'

interface TestWindow {
  __SV_TEST__?: boolean
  __soundverse?: unknown
}

/**
 * Agganci per gli e2e, attivi solo se il test imposta `window.__SV_TEST__` prima del caricamento.
 * `recipeCheck` rifà ogni clip dalla ricetta e lo confronta con l'audio salvato.
 */
export default defineNuxtPlugin(() => {
  const w = window as unknown as TestWindow
  if (!w.__SV_TEST__) return
  const library = useLibraryStore()
  w.__soundverse = {
    async recipeCheck() {
      const results = []
      for (const clip of library.clips) {
        if (!isRenderable(clip.recipe)) continue
        const stored = bufferToChannels(await library.getBuffer(clip.id))
        const rendered = await library.renderClip(clip.id)
        let maxDiff = 0
        stored.forEach((channel, c) => {
          const other = rendered[c]
          if (!other) return
          for (let i = 0; i < channel.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs((channel[i] ?? 0) - (other[i] ?? 0)))
          }
        })
        results.push({
          name: clip.name,
          type: clip.recipe.type,
          channels: [stored.length, rendered.length],
          frames: [stored[0]?.length ?? 0, rendered[0]?.length ?? 0],
          maxDiff,
        })
      }
      return results
    },
  }
})
