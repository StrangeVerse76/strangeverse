import { describe, expect, it } from 'vitest'
import { apps, statusLabels } from '../../app/data/apps'

describe('manifest delle app', () => {
  it('ha identificativi unici', () => {
    const ids = apps.map((app) => app.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('usa identificativi validi come nomi di cartella', () => {
    for (const app of apps) {
      expect(app.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  it('dà un URL https a ogni app online', () => {
    for (const app of apps.filter((a) => a.status === 'live')) {
      expect(app.url, app.id).toMatch(/^https:\/\//)
    }
  })

  it('ha un’etichetta per ogni stato', () => {
    for (const app of apps) {
      expect(statusLabels[app.status]).toBeTruthy()
    }
  })
})
