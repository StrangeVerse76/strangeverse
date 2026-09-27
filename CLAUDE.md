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

- Il `build` del layer esegue solo `nuxt prepare`: genera `packages/ui/.nuxt/`, che serve alla build delle app (Vite legge il tsconfig del layer). Turborepo lo lancia prima delle app grazie a `dependsOn: ["^build"]`.
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

**Non fa senza una richiesta esplicita**: merge su `main`, push diretti su `main`, modifiche alle variabili d'ambiente di produzione, eliminazione di repository, progetti o database, modifiche alle impostazioni degli account.

I blocchi sono imposti in `.claude/settings.json` e, soprattutto, dal ruleset di GitHub su `main`. Non si leggono mai i file `.env*`.

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
- Fase 5 (DB e login) solo quando servirà. Prossimo passo: Fase 6, **Soundverse** (ADR 0006).
- TypeScript è fermo alla 6.0 (ADR 0002). pnpm rifiuta le versioni pubblicate da meno di un giorno (ADR 0003).
- pnpm blocca gli script di installazione dei pacchetti: quelli autorizzati sono in `allowBuilds` di `pnpm-workspace.yaml`. Oggi c'è solo `esbuild`.

## Decisioni

Registro in [`docs/decisioni/`](docs/decisioni/README.md). Ogni scelta rilevante diventa un nuovo ADR, e se cambia qualcosa di operativo si aggiorna anche questo file.
