/**
 * Processori AudioWorklet di Soundverse, caricati da una stringa (niente file separati da servire).
 * Funzionano sia nel contesto live sia in quello offline: è ciò che permette un solo grafo anche
 * per gli effetti che Web Audio non ha di serie.
 */

const source = /* js */ `
class Bitcrusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 1, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()
    this.state = []
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]
    const step = 2 / Math.pow(2, parameters.bits[0])
    const factor = Math.max(1, Math.round(parameters.downsample[0]))
    for (let ch = 0; ch < output.length; ch++) {
      const inp = input[ch] || input[0]
      const out = output[ch]
      if (!inp) { out.fill(0); continue }
      const st = this.state[ch] || (this.state[ch] = { held: 0, count: 0 })
      for (let i = 0; i < out.length; i++) {
        if (st.count === 0) st.held = Math.round(inp[i] / step) * step
        st.count = (st.count + 1) % factor
        out[i] = st.held
      }
    }
    return true
  }
}
registerProcessor('sv-bitcrusher', Bitcrusher)
`

const loaded = new WeakMap<BaseAudioContext, Promise<void>>()

/** Registra i processori sul contesto (una volta sola per contesto). */
export function ensureWorklets(context: BaseAudioContext): Promise<void> {
  let promise = loaded.get(context)
  if (!promise) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    promise = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    loaded.set(context, promise)
  }
  return promise
}
