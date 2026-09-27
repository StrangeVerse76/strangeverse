import { toRaw } from 'vue'

/**
 * Copia profonda senza proxy reattivi, salvabile in IndexedDB o clonabile.
 *
 * `structuredClone(toRaw(x))` non basta: `toRaw` toglie solo il proxy esterno, e un array
 * ricostruito con `filter` o con lo spread dentro lo stato di Pinia contiene ancora proxy
 * (che `structuredClone` rifiuta). Qui si scende in array e oggetti semplici; array tipizzati,
 * Blob e simili restano come sono.
 */
export function toPlain<T>(value: T): T {
  return structuredClone(unwrap(value)) as T
}

function unwrap(value: unknown): unknown {
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(unwrap)
  if (raw !== null && typeof raw === 'object' && Object.getPrototypeOf(raw) === Object.prototype) {
    return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, unwrap(item)]))
  }
  return raw
}
