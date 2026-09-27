import type { Clip, ClipKind } from './types'

export interface ClipFilter {
  query: string
  kind: ClipKind | 'all'
}

/**
 * Filtra e ordina i clip, dal più recente.
 * Una parola della ricerca trova un clip se è contenuta nel nome oppure è **uguale** a un tag
 * ("pad" non trova "pads", lezione di Bragi). Tutte le parole devono trovare il clip.
 * Eventuali limiti sul numero di risultati vanno applicati dopo, mai prima.
 */
export function filterClips(clips: readonly Clip[], { query, kind }: ClipFilter): Clip[] {
  const words = query.toLocaleLowerCase('it').split(/\s+/).filter(Boolean)
  return clips
    .filter((clip) => kind === 'all' || clip.kind === kind)
    .filter((clip) => {
      const name = clip.name.toLocaleLowerCase('it')
      const tags = clip.tags.map((tag) => tag.toLocaleLowerCase('it'))
      return words.every((word) => name.includes(word) || tags.includes(word))
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}
