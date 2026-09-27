import { mixOf } from '~/mixer/mixer'
import type { TimelineProject } from '~/timeline/model'

/** Le tracce che hanno almeno un blocco: sono quelle che danno uno stem. */
export const stemTracks = (project: TimelineProject) =>
  project.tracks.filter((t) => project.placements.some((p) => p.trackId === t.id))

/**
 * Il progetto per lo stem di una traccia: solo quella traccia (con i suoi effetti), le altre in muto.
 * Stessa durata del mix completo: gli stem si allineano all'inizio.
 */
export function stemProject(project: TimelineProject, trackId: string): TimelineProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => ({
      ...t,
      muted: t.id !== trackId ? true : t.muted,
      mix: { ...mixOf(t.mix), solo: false },
    })),
  }
}
