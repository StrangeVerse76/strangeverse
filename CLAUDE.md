# CLAUDE.md — StrangeVerse

Sito personale che fa da **hub** per una serie di **sotto-applicativi** indipendenti (la prima è **Soundverse**, uno studio audio nel browser).
Uso personale, non commerciale, tutto su piani gratuiti. Piano completo: [`docs/piano-di-lavoro.md`](docs/piano-di-lavoro.md).

## Comandi

Runtime: Node.js 24 (`.nvmrc`), pnpm tramite Corepack (versione in `packageManager` di `package.json`).

| Comando                             | Cosa fa                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `pnpm install`                      | Installa le dipendenze di tutto il monorepo            |
| `pnpm dev --filter <app>`           | Avvia un'app in sviluppo                               |
| `pnpm lint`                         | ESLint su tutti i pacchetti (via Turborepo)            |
| `pnpm typecheck`                    | Controllo dei tipi su tutti i pacchetti                |
| `pnpm test`                         | Test Vitest su tutti i pacchetti                       |
| `pnpm build`                        | Build di tutti i pacchetti                             |
| `pnpm test:e2e --filter <app>`      | Test Playwright sulla build locale (dopo `pnpm build`) |
| `pnpm format` / `pnpm format:check` | Prettier su tutto il repo (scrive / solo controlla)    |

Per lavorare su un solo pacchetto: `pnpm <task> --filter <nome>` (es. `pnpm test --filter @strangeverse/config`).

Playwright:

- Con `PLAYWRIGHT_BASE_URL=<url>` i test girano su quell'indirizzo, per esempio un'anteprima Vercel. Senza, avviano la build locale su `localhost:3100`.
- Ogni app ha la sua porta per gli e2e locali (portale 3100, soundverse 3101), così Turborepo li esegue in parallelo. Le variabili `PLAYWRIGHT_*` sono dichiarate in `passThroughEnv` di `turbo.json`.
- Con `PLAYWRIGHT_CHANNEL=chrome` usano il Chrome installato. Serve in locale, perché su questa rete il download di Chromium da parte di Playwright va in timeout.

## Struttura

```
apps/                 # un'app Nuxt per cartella, ognuna con il proprio progetto Vercel
  portale/            # hub: home, catalogo app (app/data/apps.ts), chi sono
  soundverse/         # studio audio nel browser (ex Musica, ADR 0006): rack, libreria, timeline
packages/
  config/             # ESLint, TypeScript, Prettier condivisi (@strangeverse/config)
  ui/                 # Nuxt Layer condiviso: tema, layout, header, 404 (@strangeverse/ui)
  db/                 # (Fase 5) schema Drizzle, migrazioni, client
docs/
  piano-di-lavoro.md  # il piano
  decisioni/          # ADR: una decisione per file
.github/              # CI, Dependabot, template di PR e issue
.claude/settings.json # permessi di Claude Code per questo progetto
```

- Ogni pacchetto espone, se ha senso, gli script `lint`, `typecheck`, `test`, `build`, `dev`: Turborepo li orchestra.
- Un nuovo pacchetto estende `@strangeverse/config/tsconfig.base.json` e usa `createConfig()` da `@strangeverse/config/eslint` nel proprio `eslint.config.js`.
- Le app e i layer Nuxt usano invece `@strangeverse/config/vue`, che aggiunge le regole per Vue.

### Layer `@strangeverse/ui`

- Il layer non ha `build`: i suoi tipi (`packages/ui/.nuxt/`, letti da Vite durante la build delle app) li genera `prepare:types`, che Turborepo esegue prima di quello delle app.
- Ogni app Nuxt lo estende con `extends: ['@strangeverse/ui']` e ne eredita `app.vue`, `error.vue` (404), il layout `default`, `SiteHeader`, `SiteFooter`, `ThemeToggle`, `SiteLogo`, il CSS globale e la favicon.
- Il tema è fatto di token CSS in `packages/ui/app/assets/css/main.css`. Il predefinito è lo scuro; con la classe `.light` su `<html>` si passa al chiaro, gestito da `@nuxtjs/color-mode`. I componenti usano solo le variabili (`--color-*`, `--space-*`, `--text-*`, `--radius-*`), mai colori scritti a mano.
- Ogni app si configura nel proprio `app/app.config.ts`:
  - `site.nav` per il menu;
  - `site.homeUrl` per l'indirizzo del portale, da impostare nelle sotto-app;
  - `site.appName` per il nome della sotto-app, mostrato come "StrangeVerse / Nome" e usato nei titoli.
- `definePageMeta({ wide: true })` rende la pagina a tutta larghezza: header, contenuto e footer.
- I testi dell'interfaccia sono in italiano (`lang="it"`). i18n non è ancora attiva (D4).

### Aggiungere un'app al catalogo

Si aggiunge una voce in `apps/portale/app/data/apps.ts`. Un'app `live` deve avere un `url` https, e i test unitari lo verificano.

## Soundverse

Studio audio tutto nel browser (ADR 0006, 0008). Il codice sta in `apps/soundverse/app/`:

| Cartella      | Contenuto                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `audio/`      | Motore: `context.ts` (contesto live), `render.ts` (grafo e render offline), `decode.ts`, `wav.ts`, `peaks.ts`, `player.ts` |
| `library/`    | Tipi dei clip, ricerca (`filter.ts`), salvataggio in IndexedDB (`db.ts`, con `idb`)                                        |
| `stores/`     | Store Pinia (`library.ts`)                                                                                                 |
| `components/` | `audio/` (waveform e controlli audio), `library/` (pannello della libreria), `StudioPanel`                                 |

Regole (lezioni di Bragi, da rispettare in ogni pannello):

- **Contesto audio solo in un gesto.** `unlockAudio()` si chiama in modo sincrono nel gestore del click, prima di qualunque `await`. Per decodificare si usa un `OfflineAudioContext`, che non richiede gesti.
- **Un solo grafo.** Un suono si descrive con un `GraphBuilder` `(context, out, when)`, e lo stesso builder serve per l'ascolto dal vivo e per `renderOffline`. Mai due implementazioni della stessa spec.
- **Ogni operazione crea un clip nuovo**, con la ricetta in `clip.recipe`. Per ogni nuovo pannello si aggiunge la sua variante all'unione `ClipRecipe`.
- **Formato dei clip.** Tutto a 48 kHz, mono o stereo, salvato come WAV PCM a 24 bit con 512 picchi precalcolati.
- **IndexedDB non clona i proxy di Vue.** Prima di salvare o clonare dati presi dallo stato di Pinia si usa sempre `toPlain(x)` (`utils/plain.ts`). `structuredClone(toRaw(x))` **non basta**: gli array ricostruiti con `filter` o con lo spread contengono ancora proxy.
- **Salvataggi automatici.** Kit e progetti si salvano 400 ms dopo l'ultima modifica, e `useFlushOnHide` salva subito quando la pagina viene nascosta o chiusa. Ogni nuovo salvataggio automatico deve fare lo stesso.
- **Nomi dei file.** I componenti in sottocartelle ripetono il prefisso nel nome del file (`library/LibraryPanel.vue` → `<LibraryPanel>`), come chiede la regola `vue/multi-word-component-names`. La cartella deve coincidere **esattamente** con l'inizio del nome: `controls/ControlKnob.vue` diventerebbe `<ControlsControlKnob>`, e un `<ControlKnob>` non risolto non dà errore né in typecheck né in lint. Solo gli e2e se ne accorgono.
- **Synth.** La spec è in `synth/spec.ts`, con tipi, limiti dei parametri (`params`, `effectParams`, condivisi da manopole e `normalizeSpec`) e preset. Il grafo è in `synth/graph.ts`. `synthVoice(spec)` è la stessa Voice per `playLive` e `renderOffline`: il test `synth-graph.test.ts` confronta i due grafi su un contesto finto.
- **Niente oversampling sui WaveShaper.** In Chrome `oversample: '4x'` ritarda il segnale di 192 campioni (4 ms) e `'2x'` di 128, e la latenza cambia da browser a browser. Qualunque nodo che introduca latenza sposta i colpi fuori tempo: l'e2e della batteria controlla che un colpo cada entro 1 ms dal suo passo.
- **Batteria.** Voci in `drums/voices.ts` (ognuna è una spec del synth), pattern e tempi in `drums/pattern.ts`: `stepTime` è l'unica fonte dei tempi, swing compreso, sia per il sequencer sia per il render. Il sequencer live (`drums/sequencer.ts`) programma in anticipo sul clock dell'AudioContext; `setInterval` serve solo a svegliarlo. Nel render la coda oltre la fine si ripiega sull'inizio (`foldTail`), così il clip dura esattamente le sue battute.
- **Campioni.** Le operazioni sono funzioni pure su `Float32Array` (`samples/ops.ts`), testate una per una, e non toccano mai la sorgente. `trim` usa i tempi della sorgente, quindi sta sempre in testa alla catena ed è unico. "Resample" non esiste perché è tutto a 48 kHz: al suo posto c'è `speed` (varispeed). `AudioWaveform` con la prop `duration` seleziona una regione trascinando, e un gesto sotto i 50 ms vale come click.
- **e2e sui pannelli del rack.** Il rack scorre in orizzontale: prima di interagire col mouse su un pannello si chiama `scrollIntoViewIfNeeded()`, altrimenti su mobile, e in parte anche su desktop, il gesto cade fuori dall'area visibile.
- **Timeline.** Il modello e lo scheduling puri stanno in `timeline/model.ts`: `schedulePlays` restituisce le ripetizioni con l'offset giusto per riprendere a metà, e `fadeEvents` riparte dal valore di dissolvenza già raggiunto. Il grafo è in `timeline/graph.ts`: sorgente → dissolvenza → volume del clip → traccia → master, uguale per ascolto e render. I nodi di volume stanno in un registro **per id**, e i fader cambiano dal vivo con `applyLiveGains`. Prima di fissare `t0` si decodificano tutti i buffer (`TimelineTransport.play`); le modifiche strutturali mentre suona fanno ripartire dal punto raggiunto.
- **EQ.** I coefficienti biquad sono calcolati a mano (`eq/biquad.ts`, RBJ Cookbook) e passati a `IIRFilterNode`. La stessa formula disegna la curva (`responseDb`), costruisce il grafo (`eq/graph.ts`) e fa i test; un e2e verifica che il browser suoni la curva calcolata entro 0,2 dB. La taratura riproduce quella di Bragi (+12,4 dB a 20 Hz, −16 dB a 250 Hz con i bassi a fondo su 100 Hz). I nodi IIR non si aggiornano: a ogni modifica dal vivo si costruisce un grafo nuovo e lo si scambia. In una catena di campioni l'EQ passa da `applyChain`, che è asincrona.
- **Tempo e intonazione.** `samples/stretch.ts` contiene un WSOLA scritto da noi, senza dipendenze: `timeStretch` cambia la durata e non l'intonazione, `pitchShift` è time-stretch più varispeed. Lo spostamento delle finestre si decide sul mix mono e vale per tutti i canali. È pensato per clip brevi; per clip lunghi andrà spostato in un Worker.
- **BPM e tonalità.** `analysis/` contiene FFT, flusso spettrale e autocorrelazione per il tempo (60–200 BPM, con preferenza morbida per 120), e un cromagramma confrontato con i profili di Krumhansl-Kessler per la tonalità. Si stima all'importazione, per clip di almeno 2 s e sui primi 60 s. Batteria e mix prendono il BPM esatto dalla ricetta. `Clip.analysis` è facoltativo; se è `manual`, l'ha corretto Pietro. Sopra i 160 BPM la stima può dare la metà: per questo ci sono ×2 e ÷2.
- **MP3.** La codifica usa `@breezystack/lamejs` (LGPL-3.0, ADR 0010), solo dentro `audio/mp3.worker.ts`. Il resto dell'app chiama `encodeMp3()`. Le dipendenze con licenze non permissive vanno citate nella pagina `/licenze` di Soundverse.
- **Accordi.** La teoria sta in `chords/theory.ts` (accordi diatonici, nomi italiani, numerali, progressioni casuali con seed, condotta delle voci); il grafo in `chords/progression.ts`, dove ogni nota è una voce del synth trasportata. In minore solo il V prende la sensibile, il VII resta naturale.
- **Header stretto.** `overflow-x: clip` sulla pagina nasconde ciò che esce dallo schermo, senza far scorrere niente: per questo un e2e controlla che ogni elemento dell'header stia dentro lo schermo.
- **Sequencer dei pad.** I pattern sono in battiti (`pads/pattern.ts`, funzioni pure) e si salvano nel kit. Il sequencer (`pads/sequencer.ts`) programma sul clock dell'AudioContext e spezza la finestra alla fine del giro, così il pattern in coda parte esatto. `pads/useSequencer.ts` è lo stato condiviso fra griglia e controlli: decodifica i campioni prima di partire, gestisce registrazione e Note Repeat. Il render usa lo stesso `playPadHit`.
- **16 Levels e piano.** `pads/levels.ts` calcola le varianti di un colpo (`PadOverrides`: tono, attack, lunghezza). Gli eventi del sequencer le portano con sé (`PadEvent.overrides`), e live, sequencer e render le applicano con `{ ...pad, ...overrides }`. Due eventi con varianti diverse allo stesso istante convivono (un accordo sul piano). Le note del Note Repeat hanno una chiave (`L9`, `P60`…), così più livelli dello stesso pad si ripetono insieme.
- **Chop shop.** `chop/slices.ts` contiene transitori (flusso spettrale da `analysis/onset.ts`, poi la ricerca del vero inizio nella forma d'onda), griglia, tempo e marcatori; è tutto puro e testato (entro 2 ms). Ogni fetta diventa un clip `sample` con ricetta `trim` + `fade`, e le prime 16 vanno sui pad del banco scelto.
- **Due trappole di Vue viste nel chop.** Un `computed` che legge una variabile non reattiva (`let channels`) non si aggiorna mai: si usa un `ref`. E un `:key` che include il valore di un controllo focalizzabile ricrea l'elemento a ogni modifica, facendo perdere il focus: le chiavi devono essere stabili (id o indice).
- **Registrazione.** `RecordPanel` usa `getUserMedia` senza cancellazione dell'eco, soppressione del rumore né guadagno automatico, e un AudioWorklet (`sv-recorder` in `audio/worklets.ts`) che copia i campioni senza compressione. Registratore e misuratore vanno collegati a un guadagno zero verso l'uscita, altrimenti Chrome non li esegue. Il misuratore trattiene il picco (`meterLevel`). Negli e2e il microfono è quello finto di Chrome (`--use-fake-device-for-media-stream` in `playwright.config.ts`), che fa un beep al secondo.
- **Pad (modalità MPC).** Kit e pad in `pads/kit.ts`: 4 banchi × 16, tastiera come su una MPC (Z X C V = pad 1–4), velocity dalla posizione del tocco. Un colpo si costruisce con `playPadHit` (`pads/hit.ts`), che vale per il live e per il render. L'accordatura è varispeed (`playbackRate`), come sulle MPC. I gruppi di mute passano da `MuteGroups`. I kit stanno nello store `kits` di IndexedDB (versione 3) e si salvano da soli.
- **Rifilatura.** `Placement.offset` e `Placement.length` sono facoltativi (i progetti più vecchi non li hanno). Il segmento effettivo si legge sempre con `segment()`, mai direttamente dai campi. Ogni ripetizione riparte dall'inizio del segmento.
- **Progetti.** I progetti della timeline stanno nello store `projects` di IndexedDB. Il database ha una versione per ogni cambio di schema: `upgrade` aggiunge gli store mancanti in base a `oldVersion`, senza toccare quelli che ci sono, e un e2e parte da un database della versione precedente. Il salvataggio automatico parte 400 ms dopo l'ultima modifica, quindi ogni azione che cambia progetto (Nuovo, Apri, Duplica…) salva prima quello aperto. I blocchi di clip mancanti restano nel progetto e vengono segnalati; la pulizia automatica rimuove solo i blocchi dei clip appena eliminati.
- **IndexedDB e ricaricamento negli e2e.** L'interfaccia si aggiorna subito, ma la scrittura in IndexedDB finisce dopo, e un `page.reload()` immediato può perderla. Prima di ricaricare, il test aspetta che il dato sia nel database con `expect.poll(() => readStore(page, 'kits'))` (`tests/e2e/helpers/idb.ts`). **Non** si usa `page.waitForFunction` con una funzione che restituisce una Promise: la considera subito vera e non aspetta niente.
- **Nomi negli e2e.** `getByRole(…, { name })` confronta per sottostringa: "Elimina" trova anche "Elimina progetto". Con nomi che si somigliano va usato `exact: true`.
- **Drag and drop negli e2e.** Il trascinamento HTML5 fra libreria e timeline, lontane nella pagina, non funziona col mouse simulato di Playwright. Si usano `dispatchEvent('dragstart' | 'dragover' | 'drop', { dataTransfer })` con un `DataTransfer` vero.
- **Effetti senza nodo nativo** (per esempio il bitcrush) sono AudioWorklet in `audio/worklets.ts`, caricati con `Voice.prepare`. Funzionano sia live sia offline.

## Convenzioni

- **Lingua**: codice, nomi e messaggi di commit in inglese; issue, PR e documentazione in italiano.
- **Branch**: `feat/…`, `fix/…`, `chore/…`, `docs/…` con una breve descrizione.
- **Commit**: Conventional Commits, con lo scope del pacchetto quando serve (`feat(soundverse): add BPM control`).
- **PR**: una PR = una cosa. Si compila il template: cosa cambia, come provarlo, link all'anteprima, `Closes #<issue>`.
- **Etichette**: `app:portale`, `app:soundverse`, `infra`, `bug`, `idea`.
- **Stile**: Prettier (senza punto e virgola, apici singoli, riga a 100 colonne), TypeScript `strict`.
- Email dei commit: l'indirizzo noreply di GitHub (`…@users.noreply.github.com`), mai un'email personale o di lavoro.

## Cosa Claude può e non può fare

**Può**: creare branch, fare commit, fare push sui branch di lavoro, aprire e aggiornare PR, commentare issue, eseguire build e test in locale, leggere i log di Vercel, usare `vercel env pull` per lo sviluppo locale.

**Merge autonomo** (ADR 0009): Claude unisce da solo una PR, con `gh pr merge <n> --squash --delete-branch`, quando valgono **tutte** queste condizioni:

1. la CI è verde e le anteprime Vercel delle app toccate sono completate;
2. l'anteprima è stata controllata: le pagine rispondono e, dove serve, gli e2e girano;
3. la PR **non** rientra nei casi riservati qui sotto.

Dopo il merge, Claude verifica che la produzione si sia aggiornata e lo dice a Pietro.

**Casi riservati**, in cui il merge lo fa Pietro:

- PR che toccano `.github/`, `.claude/settings.json`, la configurazione di Vercel o GitHub, protezioni o segreti;
- aggiornamenti major di dipendenze;
- PR che Pietro ha chiesto di provare prima.

In questi casi Claude lo scrive nella descrizione della PR ("Merge: Pietro") e si ferma.

**Non fa senza una richiesta esplicita**: push diretti su `main`, modifiche alle variabili d'ambiente di produzione, eliminazione di repository, progetti o database, modifiche alle impostazioni degli account.

I blocchi sono imposti in `.claude/settings.json` e, soprattutto, dal ruleset di GitHub su `main`: anche col merge autonomo, niente arriva su `main` senza una PR con la CI verde. Non si leggono mai i file `.env*`.

## Checklist prima di aprire una PR

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build --filter <app toccata>`, se la PR tocca un'app
6. `pnpm-workspace.yaml` senza `minimumReleaseAgeExclude` (vedi ADR 0003)
7. Descrizione della PR completa, secondo il template

## CI

`.github/workflows/ci.yml` gira su ogni PR e su ogni push su `main`. Prima controlla la formattazione, poi con Turborepo esegue lint, typecheck, test, build e test Playwright (Chromium, con i browser in cache). Se fallisce, il report di Playwright si trova tra gli artifact del run.
Sulle PR usa `--affected`, quindi solo i pacchetti toccati rispetto a `main` (una modifica ai file di root li coinvolge tutti).
Nei pacchetti Nuxt la cartella `.nuxt/` (tipi generati) è stato condiviso, quindi l'ordine dei task in `turbo.json` è fissato:

1. `prepare:types` (`nuxt prepare`) la genera, prima nel layer e poi nelle app;
2. `typecheck` (`vue-tsc -b`) e `test` (Vitest) la leggono soltanto;
3. `build` la riscrive, quindi parte solo dopo `typecheck` e `test` dello stesso pacchetto.

Anche su Vercel una build passa quindi da typecheck e test. Non usare `nuxt typecheck` negli script, perché rigenera `.nuxt/` mentre altri task la leggono.

Il job si chiama **`CI`**: è il controllo obbligatorio nel ruleset di `main`.

Per leggere un fallimento: `gh pr checks <n>`, poi `gh run view <id> --log-failed`.

## Deploy (Vercel)

- Un progetto Vercel per app, tutti dallo stesso repo (team `strange-verse`, piano Hobby):

  | App        | Progetto Vercel | Root Directory    | Produzione                                    |
  | ---------- | --------------- | ----------------- | --------------------------------------------- |
  | portale    | `strangeverse`  | `apps/portale`    | https://strangeverse-strange-verse.vercel.app |
  | soundverse | `soundverse`    | `apps/soundverse` | https://soundverse-strange-verse.vercel.app   |

- Un nuovo progetto si crea importando lo stesso repo, con Root Directory `apps/<app>` e preset Nuxt; poi va impostata la protezione solo sulle anteprime (ADR 0007).
- Ogni PR ha un deploy di **anteprima**; il merge su `main` va in **produzione**. Claude non lancia mai deploy di produzione dalla CLI.
- `apps/<app>/vercel.json` usa `turbo-ignore` come _ignored build step_: se un commit non tocca l'app né i pacchetti da cui dipende, Vercel salta la build. La versione di `turbo-ignore` va tenuta uguale a quella di `turbo`.
- Collegamento locale, una volta per cartella: `cd apps/<app> && vercel link` e poi `vercel env pull .env.local`. `.vercel/` e `.env*` sono ignorati da Git, e i file `.env*` non si leggono mai.
- Leggere i deploy:
  - `vercel ls <progetto>` elenca i deploy e il loro stato;
  - `vercel inspect <url> --logs` mostra i log di build;
  - `vercel logs <url>` mostra i log di runtime;
  - `gh pr checks <n>` include lo stato di Vercel sulla PR.
- La produzione è pubblica. Le anteprime sono protette da _Vercel Authentication_ (ADR 0007): per controllarle da CLI si usa `vercel curl <path> --deployment <url>`. I test Playwright si possono lanciare sulla produzione con `PLAYWRIGHT_BASE_URL`.

## Vincoli dei piani gratuiti

- **Vercel Hobby**: solo uso personale e non commerciale; funzioni brevi (fino a 60 s); una build alla volta; limiti mensili di invocazioni e traffico. Le API restano leggere e l'audio resta nel browser.
- **Neon free**: spazio e compute limitati; il DB si sospende quando è inattivo, quindi il primo accesso è più lento.
- **GitHub Actions**: minuti illimitati, perché il repo è pubblico.
- I limiti cambiano: vanno verificati sulle pagine ufficiali prima di una scelta che ne dipende.

## Stato e note operative

- Fasi 1–4 completate: il portale è online su https://strangeverse-strange-verse.vercel.app, con il ruleset `protezione-main` attivo.
- Fase 6: **MVP di Soundverse completo** (issue #7–#12): libreria, synth, batteria, campioni, timeline. Esclusi per scelta: ACE-Step e MCP (ADR 0006).
- Fase 5 (DB e login) solo quando servirà, per esempio per sincronizzare la libreria fra dispositivi.
- TypeScript è fermo alla 6.0 (ADR 0002). pnpm rifiuta le versioni pubblicate da meno di un giorno (ADR 0003).
- pnpm blocca gli script di installazione dei pacchetti: quelli autorizzati sono in `allowBuilds` di `pnpm-workspace.yaml`. Oggi c'è solo `esbuild`.

## Decisioni

Registro in [`docs/decisioni/`](docs/decisioni/README.md). Ogni scelta rilevante diventa un nuovo ADR, e se cambia qualcosa di operativo si aggiorna anche questo file.
