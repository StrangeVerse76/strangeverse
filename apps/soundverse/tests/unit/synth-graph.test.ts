import { describe, expect, it } from 'vitest'
import { buildSynth, synthVoice } from '../../app/synth/graph'
import { defaultSpec, presets, type SynthSpec } from '../../app/synth/spec'
import { fakeContext } from './fake-audio'

/** Costruisce il grafo come farebbe `playLive` (uscita = un gain verso il master) e ne dà la descrizione. */
function liveGraph(spec: SynthSpec, when: number) {
  const { fake, context } = fakeContext()
  const out = context.createGain()
  buildSynth(spec)(context, out, when)
  return { fake, graph: fake.describe() }
}

/** Costruisce il grafo come farebbe `renderOffline` (uscita = destination, partenza a 0). */
function offlineGraph(spec: SynthSpec) {
  const { fake, context } = fakeContext()
  buildSynth(spec)(context, context.destination, 0)
  return { fake, graph: fake.describe() }
}

/** Toglie le differenze attese fra live e offline: l'istante di partenza e il nodo di uscita. */
function comparable(graph: ReturnType<typeof offlineGraph>['graph'], when: number) {
  const shift = (t: number) => Math.round((t - when) * 1e9) / 1e9
  return graph
    .filter((node) => node.kind !== 'destination')
    .map((node) => ({
      ...node,
      started: node.started.map(shift),
      stopped: node.stopped.map(shift),
      params: Object.fromEntries(
        Object.entries(node.params).map(([k, p]) => [
          k,
          {
            value: p.value,
            events: p.events.map(([name, ...args]) =>
              // Il secondo argomento delle automazioni è il tempo (il primo per 'cancel').
              name === 'cancel'
                ? [name, shift(args[0] ?? 0)]
                : [name, args[0], shift(args[1] ?? 0), ...args.slice(2)],
            ),
          },
        ]),
      ),
    }))
}

describe('buildSynth: un solo grafo per ascolto e render', () => {
  const specs: [string, SynthSpec][] = [
    ['predefinito', defaultSpec()],
    ...presets.map((p) => [p.name, p.spec()] as [string, SynthSpec]),
    [
      'con tutti gli effetti tranne bitcrush',
      {
        ...defaultSpec(),
        noise: { color: 'pink', gain: 0.2, seed: 42 },
        filter: { type: 'bandpass', cutoff: 1200, resonance: 3 },
        effects: [
          { type: 'gain', db: -3 },
          { type: 'delay', time: 0.2, feedback: 0.4, mix: 0.3 },
          { type: 'reverb', size: 0.5, damping: 0.3, mix: 0.2 },
          { type: 'softclip', drive: 4 },
          { type: 'tremolo', rate: 6, depth: 0.5 },
          { type: 'fade', fadeIn: 0.1, fadeOut: 0.2 },
        ],
      },
    ],
  ]

  it.each(specs)('%s: il grafo live coincide con quello offline', (_, spec) => {
    const when = 12.345
    const live = liveGraph(spec, when)
    const offline = offlineGraph(spec)

    // Nel grafo live c'è in più il gain di uscita creato da playLive: lo togliamo dal confronto.
    const [liveOut, ...liveNodes] = comparable(live.graph, when)
    expect(liveOut?.kind).toBe('gain')
    const offlineNodes = comparable(offline.graph, 0)

    expect(liveNodes.map(({ outputs, ...rest }) => ({ ...rest, outputs: outputs.length }))).toEqual(
      offlineNodes.map(({ outputs, ...rest }) => ({ ...rest, outputs: outputs.length })),
    )
  })

  it('collega oscillatori → inviluppo → filtro → effetti → master → uscita', () => {
    const spec: SynthSpec = {
      ...defaultSpec(),
      filter: { type: 'lowpass', cutoff: 800, resonance: 1 },
      effects: [{ type: 'softclip', drive: 2 }],
    }
    const { fake, context } = fakeContext()
    buildSynth(spec)(context, context.destination, 0)
    const kinds = fake.created.map((n) => n.kind)
    expect(kinds).toEqual([
      'gain', // somma delle sorgenti
      'oscillator',
      'gain', // livello dell'oscillatore
      'gain', // inviluppo
      'biquad',
      'waveshaper',
      'gain', // master
    ])
    const [sum, osc, level, env, filter, shaper, master] = fake.created
    expect(osc?.outputs).toEqual([level?.id])
    expect(level?.outputs).toEqual([sum?.id])
    expect(sum?.outputs).toEqual([env?.id])
    expect(env?.outputs).toEqual([filter?.id])
    expect(filter?.outputs).toEqual([shaper?.id])
    expect(shaper?.outputs).toEqual([master?.id])
    expect(master?.outputs).toEqual(['destination#0'])
  })

  it('gli oscillatori suonano esattamente per la durata', () => {
    const { fake, context } = fakeContext()
    buildSynth({ ...defaultSpec(), duration: 2 })(context, context.destination, 5)
    const osc = fake.created.find((n) => n.kind === 'oscillator')
    expect(osc?.started).toEqual([5])
    expect(osc?.stopped).toEqual([7])
  })

  it('synthVoice carica gli AudioWorklet solo se serve il bitcrush', () => {
    expect(synthVoice(defaultSpec()).prepare).toBeUndefined()
    const crushed = synthVoice({
      ...defaultSpec(),
      effects: [{ type: 'bitcrush', bits: 4, downsample: 2 }],
    })
    expect(crushed.prepare).toBeTypeOf('function')
  })
})
