import {
  buildReturns,
  buildStrip,
  defaultReturns,
  mixOf,
  updateReturns,
  updateStrip,
  type ChannelMix,
  type ReturnNodes,
  type Returns,
  type StripNodes,
} from '~/mixer/mixer'

/** Il canale "Pad" del mixer: tutto ciò che suonano i pad passa di qui. */
export interface PadMixer {
  gain: number
  muted: boolean
  mix?: Partial<ChannelMix>
  returns?: Returns
}

export const defaultPadMixer = (): PadMixer => ({ gain: 1, muted: false })

export interface PadBusNodes {
  fader: GainNode
  strip: StripNodes
  returns: ReturnNodes
}

/** Costruisce il canale dei pad da `input` a `out` (stesso grafo per il live e per il render). */
export function buildPadBus(
  context: BaseAudioContext,
  input: AudioNode,
  out: AudioNode,
  mixer: PadMixer,
  when: number,
): PadBusNodes {
  const fader = context.createGain()
  fader.gain.value = mixer.muted ? 0 : mixer.gain
  input.connect(fader)
  const returns = buildReturns(context, out, mixer.returns ?? defaultReturns(), when)
  const strip = buildStrip(context, fader, out, mixOf(mixer.mix), returns)
  return { fader, strip, returns }
}

interface LiveBus {
  context: AudioContext
  /** Ingresso fisso: il sequencer e i colpi dal vivo si collegano qui una volta per tutte. */
  input: GainNode
  nodes: PadBusNodes
  /** Chiave dell'EQ con cui è stato costruito: se cambia, la catena si ricostruisce. */
  eqKey: string
}

let live: LiveBus | null = null

const eqKey = (mixer: PadMixer) => JSON.stringify(mixOf(mixer.mix).eq)

/** Il canale dei pad sul contesto live, creato la prima volta e poi aggiornato. */
export function livePadBus(context: AudioContext, master: AudioNode, mixer: PadMixer): GainNode {
  if (!live || live.context !== context) {
    const input = context.createGain()
    live = {
      context,
      input,
      nodes: buildPadBus(context, input, master, mixer, context.currentTime),
      eqKey: eqKey(mixer),
    }
  }
  return live.input
}

/** Applica il mixer dei pad dal vivo; l'EQ cambiato ricostruisce la catena dopo l'ingresso. */
export function updatePadBus(master: AudioNode, mixer: PadMixer) {
  if (!live) return
  const now = live.context.currentTime
  if (eqKey(mixer) !== live.eqKey) {
    live.input.disconnect()
    for (const lfo of live.nodes.returns.lfos) lfo.stop(now + 0.05)
    const old = live.nodes
    setTimeout(() => {
      old.strip.panner.disconnect()
      old.returns.levels.forEach((l) => l.disconnect())
    }, 60)
    live.nodes = buildPadBus(live.context, live.input, master, mixer, now)
    live.eqKey = eqKey(mixer)
    return
  }
  live.nodes.fader.gain.setTargetAtTime(mixer.muted ? 0 : mixer.gain, now, 0.01)
  updateStrip(live.nodes.strip, mixOf(mixer.mix), now)
  updateReturns(live.nodes.returns, mixer.returns ?? defaultReturns(), now)
}
