/**
 * FFT radix-2 in-place (Cooley-Tukey). `re` e `im` hanno lunghezza potenza di 2.
 * Basta per l'analisi (BPM, tonalità): niente dipendenze.
 */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0]
      ;[im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < size / 2; k++) {
        const a = start + k
        const b = a + size / 2
        const tRe = (re[b] ?? 0) * curRe - (im[b] ?? 0) * curIm
        const tIm = (re[b] ?? 0) * curIm + (im[b] ?? 0) * curRe
        re[b] = (re[a] ?? 0) - tRe
        im[b] = (im[a] ?? 0) - tIm
        re[a] = (re[a] ?? 0) + tRe
        im[a] = (im[a] ?? 0) + tIm
        const next = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = next
      }
    }
  }
}

/**
 * Spettro di ampiezza di ogni finestra (Hann) di `size` campioni, a passo `hop`.
 * `onFrame` riceve l'ampiezza dei bin 0..size/2.
 */
export function spectrogram(
  signal: Float32Array,
  size: number,
  hop: number,
  onFrame: (magnitudes: Float64Array, index: number) => void,
) {
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  )
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const magnitudes = new Float64Array(size / 2 + 1)
  for (let start = 0, index = 0; start + size <= signal.length; start += hop, index++) {
    for (let i = 0; i < size; i++) {
      re[i] = (signal[start + i] ?? 0) * (window[i] ?? 0)
      im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k <= size / 2; k++) magnitudes[k] = Math.hypot(re[k] ?? 0, im[k] ?? 0)
    onFrame(magnitudes, index)
  }
}
