/**
 * Un finto BaseAudioContext che registra il grafo invece di suonarlo: nodi creati, collegamenti,
 * valori e automazioni dei parametri. Serve a confrontare grafi costruiti su contesti diversi.
 */

type Event = [string, ...number[]]

class FakeParam {
  value = 0
  events: Event[] = []
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t])
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['linear', v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t])
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.events.push(['target', v, t, c])
  }
  cancelScheduledValues(t: number) {
    this.events.push(['cancel', t])
  }
}

let counter = 0

class FakeNode {
  readonly id: string
  readonly outputs: string[] = []
  started: number[] = []
  stopped: number[] = []
  type?: string
  buffer?: unknown
  curve?: Float32Array
  oversample?: string

  constructor(
    readonly kind: string,
    params: string[] = [],
  ) {
    this.id = `${kind}#${counter++}`
    for (const name of params)
      (this as unknown as Record<string, FakeParam>)[name] = new FakeParam()
  }

  connect<T extends FakeNode | FakeParam>(target: T): T {
    this.outputs.push(target instanceof FakeNode ? target.id : `${this.findOwner(target)}`)
    return target
  }

  private findOwner(param: FakeParam) {
    return `param:${nodes.find((n) => Object.values(n).includes(param))?.id ?? '?'}`
  }

  start(when = 0) {
    this.started.push(when)
  }
  stop(when = 0) {
    this.stopped.push(when)
  }
  disconnect() {}
}

let nodes: FakeNode[] = []

export class FakeAudioContext {
  readonly sampleRate = 48_000
  readonly currentTime = 0
  readonly destination: FakeNode
  readonly created: FakeNode[] = []

  constructor() {
    nodes = []
    counter = 0
    this.destination = new FakeNode('destination')
    nodes.push(this.destination)
  }

  private track<T extends FakeNode>(node: T): T {
    nodes.push(node)
    this.created?.push(node)
    return node
  }

  createGain = () => this.track(new FakeNode('gain', ['gain']))
  createOscillator = () => this.track(new FakeNode('oscillator', ['frequency', 'detune']))
  createBiquadFilter = () => this.track(new FakeNode('biquad', ['frequency', 'Q', 'gain']))
  createDelay = () => this.track(new FakeNode('delay', ['delayTime']))
  createConvolver = () => this.track(new FakeNode('convolver'))
  createWaveShaper = () => this.track(new FakeNode('waveshaper'))
  createBufferSource = () => this.track(new FakeNode('buffersource', ['playbackRate']))
  createBuffer = (channels: number, length: number, sampleRate: number) => ({
    channels,
    length,
    sampleRate,
    data: [] as Float32Array[],
    copyToChannel(data: Float32Array, channel: number) {
      this.data[channel] = data
    },
  })

  /** Descrizione serializzabile del grafo, con gli id resi stabili. */
  describe() {
    return nodes.map((node) => ({
      kind: node.kind,
      type: node.type,
      outputs: node.outputs,
      started: node.started,
      stopped: node.stopped,
      params: Object.fromEntries(
        Object.entries(node)
          .filter(([, v]) => v instanceof FakeParam)
          .map(([k, v]) => [k, { value: (v as FakeParam).value, events: (v as FakeParam).events }]),
      ),
      buffer: node.buffer ? 'buffer' : undefined,
    }))
  }
}

/** Il FakeAudioContext tipizzato come contesto vero, per passarlo ai builder. */
export function fakeContext() {
  const fake = new FakeAudioContext()
  return { fake, context: fake as unknown as BaseAudioContext }
}
