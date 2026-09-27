import type { SynthSpec } from '~/synth/spec'

export type DrumVoiceId = 'kick' | 'snare' | 'clap' | 'rim' | 'tom' | 'hat' | 'hatOpen' | 'ride'

export const voiceIds: DrumVoiceId[] = [
  'kick',
  'snare',
  'clap',
  'rim',
  'tom',
  'hat',
  'hatOpen',
  'ride',
]

export const voiceLabels: Record<DrumVoiceId, string> = {
  kick: 'Cassa',
  snare: 'Rullante',
  clap: 'Clap',
  rim: 'Rim',
  tom: 'Tom',
  hat: 'Charleston',
  hatOpen: 'Charleston aperto',
  ride: 'Ride',
}

const env = (attack: number, decay: number, sustain: number, release: number) => ({
  attack,
  decay,
  sustain,
  release,
})

/** Ogni voce è una spec del synth: stesso motore, stesso grafo, dal vivo e offline. */
export const voiceSpecs: Record<DrumVoiceId, SynthSpec> = {
  kick: {
    duration: 0.45,
    oscillators: [
      { waveform: 'sine', frequency: 48, gain: 1, detune: 0, sweep: { ratio: 3.5, time: 0.07 } },
    ],
    noise: null,
    envelope: env(0.001, 0.32, 0, 0.08),
    filter: null,
    effects: [{ type: 'softclip', drive: 2 }],
    master: 0.9,
  },
  snare: {
    duration: 0.25,
    oscillators: [
      {
        waveform: 'triangle',
        frequency: 185,
        gain: 0.45,
        detune: 0,
        sweep: { ratio: 1.5, time: 0.03 },
      },
    ],
    noise: { color: 'white', gain: 0.6, seed: 2 },
    envelope: env(0.001, 0.14, 0, 0.06),
    filter: { type: 'highpass', cutoff: 180, resonance: 0.7 },
    effects: [],
    master: 0.8,
  },
  clap: {
    duration: 0.25,
    oscillators: [],
    noise: { color: 'white', gain: 0.9, seed: 3 },
    envelope: env(0.002, 0.08, 0.12, 0.1),
    filter: { type: 'bandpass', cutoff: 1500, resonance: 1.2 },
    effects: [],
    master: 0.9,
  },
  rim: {
    duration: 0.07,
    oscillators: [
      { waveform: 'square', frequency: 820, gain: 0.3, detune: 0 },
      { waveform: 'triangle', frequency: 1700, gain: 0.25, detune: 0 },
    ],
    noise: null,
    envelope: env(0.0005, 0.03, 0, 0.02),
    filter: { type: 'highpass', cutoff: 600, resonance: 0.7 },
    effects: [],
    master: 0.7,
  },
  tom: {
    duration: 0.5,
    oscillators: [
      { waveform: 'sine', frequency: 120, gain: 0.9, detune: 0, sweep: { ratio: 1.6, time: 0.1 } },
    ],
    noise: null,
    envelope: env(0.001, 0.36, 0, 0.1),
    filter: null,
    effects: [],
    master: 0.8,
  },
  hat: {
    duration: 0.08,
    oscillators: [],
    noise: { color: 'white', gain: 0.8, seed: 4 },
    envelope: env(0.0005, 0.04, 0, 0.03),
    filter: { type: 'highpass', cutoff: 7000, resonance: 0.7 },
    effects: [],
    master: 0.55,
  },
  hatOpen: {
    duration: 0.45,
    oscillators: [],
    noise: { color: 'white', gain: 0.8, seed: 5 },
    envelope: env(0.0005, 0.28, 0.1, 0.12),
    filter: { type: 'highpass', cutoff: 6500, resonance: 0.7 },
    effects: [],
    master: 0.5,
  },
  ride: {
    duration: 1.2,
    oscillators: [
      { waveform: 'square', frequency: 510, gain: 0.12, detune: 0 },
      { waveform: 'square', frequency: 770, gain: 0.1, detune: 0 },
    ],
    noise: { color: 'white', gain: 0.2, seed: 6 },
    envelope: env(0.001, 0.8, 0.1, 0.3),
    filter: { type: 'highpass', cutoff: 3500, resonance: 0.5 },
    effects: [],
    master: 0.45,
  },
}

/** La coda più lunga fra le voci: quanto un colpo può "sforare" oltre la fine del pattern. */
export const MAX_VOICE_DURATION = Math.max(...Object.values(voiceSpecs).map((s) => s.duration))
