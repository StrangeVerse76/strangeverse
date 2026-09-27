<script setup lang="ts">
import { getLiveAudio } from '~/audio/context'
import { defaultReturns, mixOf, mixParams, SENDS, type Returns } from '~/mixer/mixer'
import { updatePadBus } from '~/pads/bus'
import type { ParamDef } from '~/synth/spec'
import { usePadsStore } from '~/stores/pads'
import { useTimelineStore } from '~/stores/timeline'

const timeline = useTimelineStore()
const pads = usePadsStore()

/** I campi del mixer sono facoltativi nei dati salvati: qui si riempiono prima di modificarli. */
watchEffect(() => {
  for (const track of timeline.project.tracks) {
    if (!track.mix || track.mix.sends?.length !== SENDS.length) track.mix = mixOf(track.mix)
  }
  timeline.project.returns ??= defaultReturns()
  const mixer = pads.kit.mixer
  if (mixer) {
    if (!mixer.mix || mixer.mix.sends?.length !== SENDS.length) mixer.mix = mixOf(mixer.mix)
    mixer.returns ??= defaultReturns()
  }
})

// Il canale dei pad si aggiorna dal vivo (la timeline lo fa nel suo pannello).
watch(
  () => pads.kit.mixer,
  (mixer) => {
    const live = getLiveAudio()
    if (live && mixer) updatePadBus(live.master, mixer)
  },
  { deep: true },
)

const levelDef = (i: number): ParamDef => ({ ...mixParams.level, label: SENDS[i] ?? 'Ritorno' })

function setLevel(returns: Returns, i: number, value: number) {
  returns.levels[i] = value
}
</script>

<template>
  <div class="mixer">
    <p class="hint">
      Un canale per traccia della timeline e uno per i pad. Le mandate vanno a riverbero, delay,
      chorus e flanger.
    </p>

    <h3 class="title">Timeline</h3>
    <div class="strips">
      <template v-for="track in timeline.project.tracks" :key="track.id">
        <MixerStrip
          v-if="track.mix"
          v-model:gain="track.gain"
          v-model:muted="track.muted"
          v-model:mix="track.mix as never"
          :name="track.name"
        />
      </template>
    </div>

    <div
      v-if="timeline.project.returns"
      class="returns"
      role="group"
      aria-label="Ritorni della timeline"
    >
      <ControlKnob
        v-for="(_, i) in SENDS"
        :key="i"
        :model-value="timeline.project.returns.levels[i] ?? 0.8"
        :def="levelDef(i)"
        :aria-label="`Ritorno ${SENDS[i]} timeline`"
        @update:model-value="setLevel(timeline.project.returns, i, $event)"
      />
      <ControlKnob v-model="timeline.project.returns.reverbSize" :def="mixParams.reverbSize" />
      <ControlKnob v-model="timeline.project.returns.delayTime" :def="mixParams.delayTime" />
      <ControlKnob
        v-model="timeline.project.returns.delayFeedback"
        :def="mixParams.delayFeedback"
      />
    </div>

    <h3 class="title">Pad</h3>
    <MixerStrip
      v-if="pads.kit.mixer?.mix"
      v-model:gain="pads.kit.mixer.gain"
      v-model:muted="pads.kit.mixer.muted"
      v-model:mix="pads.kit.mixer.mix as never"
      name="Pad"
    />
    <div v-if="pads.kit.mixer?.returns" class="returns" role="group" aria-label="Ritorni dei pad">
      <ControlKnob
        v-for="(_, i) in SENDS"
        :key="i"
        :model-value="pads.kit.mixer.returns.levels[i] ?? 0.8"
        :def="levelDef(i)"
        :aria-label="`Ritorno ${SENDS[i]} pad`"
        @update:model-value="setLevel(pads.kit.mixer.returns, i, $event)"
      />
      <ControlKnob v-model="pads.kit.mixer.returns.delayTime" :def="mixParams.delayTime" />
      <ControlKnob v-model="pads.kit.mixer.returns.delayFeedback" :def="mixParams.delayFeedback" />
    </div>
  </div>
</template>

<style scoped>
.mixer {
  display: grid;
  gap: var(--space-3);
}

.title {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.strips {
  display: grid;
  gap: var(--space-2);
}

.returns {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}
</style>
