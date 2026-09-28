/** Durata in forma breve: `0:03.2`, `1:05.0`. */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

/** Valore di un parametro con la sua unità, in forma compatta: `220 Hz`, `1.20 kHz`, `250 ms`, `+3.0 dB`. */
export function formatParam(value: number, unit: string, step = 0.01): string {
  if (unit === 'Hz' && value >= 1000) return `${(value / 1000).toFixed(2)} kHz`
  if (unit === 'Hz') return `${value < 100 ? value.toFixed(1) : Math.round(value)} Hz`
  if (unit === 's' && value < 1) return `${Math.round(value * 1000)} ms`
  if (unit === 's') return `${value.toFixed(2)} s`
  if (unit === 'dB') return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`
  if (unit === 'ct' || unit === 'st') return `${value > 0 ? '+' : ''}${Math.round(value)} ${unit}`
  const decimals = step >= 1 ? 0 : 2
  return unit ? `${value.toFixed(decimals)}${unit}` : value.toFixed(decimals)
}

/** Livello lineare in dBFS con un decimale; il silenzio è `-∞ dBFS`. */
export function formatDb(level: number): string {
  if (!(level > 0)) return '-∞ dBFS'
  return `${(20 * Math.log10(level)).toFixed(1)} dBFS`
}

/** Byte in unità leggibili, in italiano: "12,4 MB", "1 GB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 || Number.isInteger(value) ? 0 : 1
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`
}
