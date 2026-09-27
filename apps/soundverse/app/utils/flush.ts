import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Salva subito quando la pagina viene nascosta o chiusa. I salvataggi automatici aspettano
 * qualche centinaio di millisecondi dopo l'ultima modifica, e ricaricare o chiudere prima
 * farebbe perdere le ultime modifiche.
 */
export function useFlushOnHide(flush: () => void) {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
  })
}
