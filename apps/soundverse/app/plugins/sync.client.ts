import { useMe } from '~/auth/me'
import { useLibraryStore } from '~/stores/library'
import { usePadsStore } from '~/stores/pads'
import { useTimelineStore } from '~/stores/timeline'
import { fetchUsage, syncOnce } from '~/sync/engine'
import { useSyncNow, useSyncStatus } from '~/sync/status'

/** Attesa dopo l'ultima modifica locale prima di inviarla (ms): i salvataggi arrivano a raffiche. */
const DEBOUNCE = 3000

/**
 * La sincronizzazione (ADR 0011): parte solo con il login, all'avvio, dopo le modifiche locali,
 * quando si torna online o sulla scheda. Un giro alla volta; se ne serve un altro, si accoda.
 */
export default defineNuxtPlugin(() => {
  const { me, refresh } = useMe()
  const status = useSyncStatus()
  const now = useSyncNow()
  const library = useLibraryStore()
  const timeline = useTimelineStore()
  const pads = usePadsStore()
  let running = false
  let again = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function run() {
    if (!me.value?.user) return
    if (running) {
      again = true
      return
    }
    if (!navigator.onLine) {
      status.value.state = 'offline'
      return
    }
    running = true
    status.value.state = 'syncing'
    try {
      // Prima si salva quello che è in attesa, così parte anche quello.
      timeline.flush()
      pads.flush()
      const report = await syncOnce()
      if (report.changed.size) {
        await Promise.all([
          library.refresh(report.changed),
          timeline.refresh(report.changed),
          pads.refresh(report.changed),
        ])
      }
      status.value = {
        state: 'ok',
        lastSync: Date.now(),
        waiting: report.waiting,
        usage: await fetchUsage().catch(() => status.value.usage),
        error: null,
      }
    } catch (error) {
      console.error('Sincronizzazione', error)
      status.value.state = navigator.onLine ? 'error' : 'offline'
      status.value.error = (error as Error).message
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }

  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), DEBOUNCE)
  }

  now.value = () => void run()
  window.addEventListener('sv-local-change', soon)
  window.addEventListener('online', () => void run())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void run()
  })

  watch(
    () => me.value?.user,
    (user) => {
      if (user) void run()
      else status.value.state = 'off'
    },
  )
  void refresh()
})
