# 0005 — Tema con token CSS, senza framework UI

- **Stato**: Accettata
- **Data**: 2026-09-27

## Contesto

`packages/ui` deve dare a tutte le app lo stesso aspetto: palette, tipografia, tema chiaro e scuro. Si poteva usare un framework di componenti (Nuxt UI, Vuetify…) o una libreria di utility CSS (Tailwind).

## Decisione

- Il tema è fatto di **variabili CSS** (token) in un solo file, `packages/ui/app/assets/css/main.css`, più pochi componenti Vue con stili `scoped`.
- Il tema chiaro/scuro è gestito da **`@nuxtjs/color-mode`**. Segue la preferenza del sistema e ricorda la scelta; la classe su `<html>` evita il lampo del tema sbagliato al caricamento.
- Niente framework UI e niente Tailwind, per ora.

## Conseguenze

- Pochissime dipendenze e pagine leggere: conta per il sequencer, che deve restare reattivo.
- Ogni componente nuovo va scritto a mano, usando solo i token.
- Se un giorno servissero molti componenti complessi (tabelle, dialoghi, form), si potrà valutare una libreria con un nuovo ADR.
