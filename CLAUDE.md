# CLAUDE.md — StrangeVerse

Sito personale che fa da **hub** per una serie di **sotto-applicativi** indipendenti (la prima è un'app per fare musica: uno step sequencer).
Uso personale, non commerciale, tutto su piani gratuiti. Piano completo: [`docs/piano-di-lavoro.md`](docs/piano-di-lavoro.md).

## Comandi

Runtime: Node.js 24 (`.nvmrc`), pnpm tramite Corepack (versione in `packageManager` di `package.json`).

| Comando                             | Cosa fa                                             |
| ----------------------------------- | --------------------------------------------------- |
| `pnpm install`                      | Installa le dipendenze di tutto il monorepo         |
| `pnpm dev --filter <app>`           | Avvia un'app in sviluppo                            |
| `pnpm lint`                         | ESLint su tutti i pacchetti (via Turborepo)         |
| `pnpm typecheck`                    | Controllo dei tipi su tutti i pacchetti             |
| `pnpm test`                         | Test Vitest su tutti i pacchetti                    |
| `pnpm build`                        | Build di tutti i pacchetti                          |
| `pnpm format` / `pnpm format:check` | Prettier su tutto il repo (scrive / solo controlla) |

Per lavorare su un solo pacchetto: `pnpm <task> --filter <nome>` (es. `pnpm test --filter @strangeverse/config`).

## Struttura

```
apps/                 # un'app Nuxt per cartella, ognuna con il proprio progetto Vercel
  portale/            # (Fase 3) hub: home, catalogo app, profilo
  musica/             # (Fase 6) step sequencer
packages/
  config/             # ESLint, TypeScript, Prettier condivisi (@strangeverse/config)
  ui/                 # (Fase 4) Nuxt Layer condiviso: tema, layout, componenti
  db/                 # (Fase 5) schema Drizzle, migrazioni, client
docs/
  piano-di-lavoro.md  # il piano
  decisioni/          # ADR: una decisione per file
.github/              # CI, Dependabot, template di PR e issue
.claude/settings.json # permessi di Claude Code per questo progetto
```

- Ogni pacchetto espone, se ha senso, gli script `lint`, `typecheck`, `test`, `build`, `dev`: Turborepo li orchestra.
- Un nuovo pacchetto estende `@strangeverse/config/tsconfig.base.json` e usa `createConfig()` da `@strangeverse/config/eslint` nel proprio `eslint.config.js`.
- Le app Nuxt aggiungeranno le regole per Vue sopra la configurazione di base.

## Convenzioni

- **Lingua**: codice, nomi e messaggi di commit in inglese; issue, PR e documentazione in italiano.
- **Branch**: `feat/…`, `fix/…`, `chore/…`, `docs/…` con una breve descrizione.
- **Commit**: Conventional Commits, con lo scope del pacchetto quando serve (`feat(musica): add BPM control`).
- **PR**: una PR = una cosa. Si compila il template: cosa cambia, come provarlo, link all'anteprima, `Closes #<issue>`.
- **Etichette**: `app:portale`, `app:musica`, `infra`, `bug`, `idea`.
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

`.github/workflows/ci.yml` gira su ogni PR e su ogni push su `main`: formattazione, poi lint, typecheck e test tramite Turborepo.
Sulle PR usa `--affected`, quindi solo i pacchetti toccati rispetto a `main` (una modifica ai file di root li coinvolge tutti).
Il job si chiama **`CI`**: è il controllo obbligatorio nel ruleset di `main`.

Per leggere un fallimento: `gh pr checks <n>`, poi `gh run view <id> --log-failed`.

## Vincoli dei piani gratuiti

- **Vercel Hobby**: solo uso personale e non commerciale; funzioni brevi (fino a 60 s); una build alla volta; limiti mensili di invocazioni e traffico. Le API restano leggere e l'audio resta nel browser.
- **Neon free**: spazio e compute limitati; il DB si sospende quando è inattivo, quindi il primo accesso è più lento.
- **GitHub Actions**: minuti illimitati, perché il repo è pubblico.
- I limiti cambiano: vanno verificati sulle pagine ufficiali prima di una scelta che ne dipende.

## Stato e note operative

- Fasi 1–2 in corso. L'account Vercel è in attesa di verifica da parte del supporto Vercel: la Fase 3 parte quando è sbloccato.
- TypeScript è fermo alla 6.0 (ADR 0002). pnpm rifiuta le versioni pubblicate da meno di un giorno (ADR 0003).

## Decisioni

Registro in [`docs/decisioni/`](docs/decisioni/README.md). Ogni scelta rilevante diventa un nuovo ADR, e se cambia qualcosa di operativo si aggiorna anche questo file.
