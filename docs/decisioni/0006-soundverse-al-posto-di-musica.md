# 0006 — Soundverse al posto della sotto-app Musica

- **Stato**: Accettata
- **Data**: 2026-09-27
- **Modifica**: §7 del piano (sotto-app Musica)

## Contesto

Il piano prevedeva come prima sotto-app uno step sequencer ("Musica"). Pietro ha già sviluppato per conto suo Bragi, una console audio con frontend Vue 3 + TypeScript e backend Python: synth deterministico, gestione dei campioni, equalizzatore, timeline, generazione con ACE-Step e server MCP.

## Decisione

- La prima sotto-app è **Soundverse**: prende le idee di Bragi e le **riscrive da zero** sullo stack di StrangeVerse (Nuxt 4, TypeScript, layer `@strangeverse/ui`). Non si copia il codice di Bragi.
- Cartella `apps/soundverse`, etichetta `app:soundverse`. Sostituisce `apps/musica`.
- Tutto gira **nel browser**: synth ed effetti con Web Audio (ed eventualmente Tone.js), elaborazione dei campioni, libreria dei clip in IndexedDB.
- Restano fuori: la generazione con **ACE-Step**, che richiede un modello locale pesante e non è compatibile con Vercel Hobby, e il **server MCP**. Si possono rivalutare più avanti come estensioni opzionali verso un servizio locale.
- L'MVP e le iterazioni si definiscono come issue prima di iniziare la Fase 6.

## Conseguenze

- Il §7 del piano (step sequencer) resta come riferimento storico: la pianificazione di Soundverse sostituisce quella sezione.
- Senza backend Python, funzioni come l'analisi di BPM e tonalità vanno rifatte in TypeScript o WebAssembly, oppure rimandate.
