# Piano di lavoro — Sito personale con sotto-applicativi

> Documento di riferimento per il progetto `strangeverse` (StrangeVerse).
> Destinatari: Pietro (owner) e Claude Code (sviluppo operativo).
> Uso: personale, non commerciale — tutto su piani gratuiti.

---

## 1. Obiettivo

Realizzare un sito personale che funge da **hub** per una serie di **sotto-applicativi** indipendenti, a partire da un'applicazione web per fare musica. Il progetto deve essere impostato "per bene" fin dall'inizio: repository ordinato, CI, anteprime automatiche, deploy continuo, convenzioni chiare.

Claude Code gestisce il ciclo completo, **dai sorgenti alla pubblicazione**; Pietro mantiene il controllo su cosa va in produzione tramite l'approvazione delle Pull Request.

---

## 2. Principi

1. **Un solo linguaggio**: TypeScript ovunque, frontend e backend.
2. **Tutto passa da una Pull Request**: nessun push diretto su `main`.
3. **Il merge è umano**: Claude prepara, verifica e propone; Pietro approva e fa merge. _Aggiornato: Claude fa il merge da solo quando la CI e le anteprime sono verdi, tranne che nei casi riservati ([ADR 0009](decisioni/0009-merge-autonomo.md))._
4. **Ogni PR ha un'anteprima**: si prova sempre su un URL reale prima di andare in produzione.
5. **Sotto-app isolate**: se una si rompe, le altre restano online.
6. **Gratis per davvero**: si progetta entro i limiti dei piani free; il carico pesante resta nel browser.
7. **Segreti fuori dal codice**: solo variabili d'ambiente su Vercel, mai nel repo né in chat.
8. **Decisioni scritte**: ogni scelta rilevante finisce in `CLAUDE.md` o in `docs/decisioni/`.

---

## 3. Stack

| Livello      | Tecnologia                               | Note                                                        |
| ------------ | ---------------------------------------- | ----------------------------------------------------------- |
| Framework    | **Nuxt 4** + Vue 3                       | Frontend e API (`server/api/`) nello stesso progetto        |
| Linguaggio   | **TypeScript** (strict)                  | Tipi condivisi tra client, server e DB                      |
| Monorepo     | **pnpm workspaces** + **Turborepo**      | Build incrementali, Vercel ricostruisce solo ciò che cambia |
| Hosting      | **Vercel Hobby**                         | Un progetto Vercel per ogni app, stesso repo                |
| Database     | **Neon Postgres**                        | Free tier, branch del DB per ogni PR                        |
| ORM          | **Drizzle**                              | Schema in TypeScript, migrazioni versionate                 |
| Auth         | **Better Auth** (GitHub OAuth)           | Solo quando serve; niente password da gestire               |
| Cache (opz.) | **Upstash Redis**                        | Solo se necessario (rate limiting, cache)                   |
| Audio        | **Web Audio API** + **Tone.js**          | Tutto lato browser                                          |
| Test         | **Vitest** (unit) + **Playwright** (e2e) | Playwright dalla Fase 4 in poi                              |
| Qualità      | ESLint, Prettier, `vue-tsc`              | Configurazioni condivise in `packages/config`               |
| CI           | **GitHub Actions**                       | Lint, typecheck, test su ogni PR                            |
| Dipendenze   | **Dependabot**                           | PR automatiche settimanali                                  |

Runtime locale: **Node.js LTS attuale** (24.x), **pnpm** tramite Corepack.

---

## 4. Architettura

### 4.1 Struttura del repository

```
strangeverse/
├── apps/
│   ├── portale/            # hub: home, catalogo app, profilo
│   └── musica/             # prima sotto-app: step sequencer
├── packages/
│   ├── ui/                 # Nuxt Layer condiviso: tema, layout, componenti
│   ├── db/                 # schema Drizzle, migrazioni, client
│   └── config/             # ESLint, TS, Prettier condivisi
├── docs/
│   ├── piano-di-lavoro.md  # questo documento
│   └── decisioni/          # ADR brevi: una decisione per file
├── .github/
│   ├── workflows/ci.yml
│   ├── dependabot.yml
│   └── pull_request_template.md
├── CLAUDE.md               # istruzioni operative per Claude Code
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 4.2 Come si compone il sito

- Ogni cartella in `apps/` è un'applicazione Nuxt autonoma, collegata a **un proprio progetto Vercel** (Root Directory = `apps/<nome>`).
- `packages/ui` è un **Nuxt Layer**: ogni app lo estende (`extends: ['@strangeverse/ui']`) ed eredita tema, layout, header e componenti comuni. L'aspetto resta coerente senza duplicare codice.
- Indirizzi:
  - senza dominio: `strangeverse.vercel.app`, `strangeverse-musica.vercel.app`;
  - con dominio personale (consigliato): `dominio.it` → portale, `musica.dominio.it` → musica. Serve anche per condividere il login tra le app (cookie sul dominio padre).
- Il portale legge un **manifest delle app** (nome, descrizione, icona, URL, stato) e costruisce il catalogo.

### 4.3 Aggiungere una nuova sotto-app

1. Copiare lo scheletro `apps/_template` in `apps/<nuova>`.
2. Registrarla nel manifest del portale.
3. Creare il progetto Vercel con Root Directory `apps/<nuova>`.
4. (Opz.) Aggiungere il sottodominio.

---

## 5. Come funziona il flusso di lavoro

```
Issue su GitHub  →  Claude Code crea branch  →  commit  →  Pull Request
      ↑                                                        │
      │                                          CI: lint · typecheck · test
      │                                                        │
      │                                   Vercel: URL di anteprima + branch DB Neon
      │                                                        │
      └──────── feedback ◄──── Pietro prova l'anteprima ◄──────┘
                                         │
                                   merge su main
                                         │
                                  deploy in produzione
```

### 5.1 Ruoli

| Chi                | Fa                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Pietro**         | Scrive le issue (cosa si vuole), prova le anteprime, approva e fa merge, gestisce account e segreti                                    |
| **Claude Code**    | Legge la issue, crea il branch, scrive codice e test, apre la PR, risolve i fallimenti della CI, aggiorna documentazione e `CLAUDE.md` |
| **GitHub Actions** | Verifica automatica di ogni PR                                                                                                         |
| **Vercel**         | Anteprima per ogni PR, produzione a ogni merge su `main`                                                                               |

### 5.2 Convenzioni

- **Branch**: `feat/<breve-descrizione>`, `fix/…`, `chore/…`, `docs/…`.
- **Commit**: Conventional Commits (`feat(musica): aggiunge controllo BPM`).
- **PR**: una PR = una cosa. Descrizione con: cosa cambia, come provarlo, link all'anteprima, `Closes #<issue>`.
- **Issue**: titolo chiaro, criterio di accettazione ("è fatto quando…"). Etichette: `app:portale`, `app:musica`, `infra`, `bug`, `idea`.
- **Lingua**: codice e commit in inglese; issue, PR e documentazione in italiano.

### 5.3 Cosa Claude Code può e non può fare

**Può**: creare branch, commit, push sui branch di lavoro, aprire e aggiornare PR, commentare issue, eseguire build/test in locale, leggere i log di Vercel, usare `vercel env pull` per lo sviluppo locale.

**Non fa senza richiesta esplicita**: merge su `main` nei casi riservati dell'[ADR 0009](decisioni/0009-merge-autonomo.md), push diretti su `main`, modifica delle variabili d'ambiente di produzione, eliminazione di repository/progetti/database, modifiche alle impostazioni degli account.

Queste regole non restano solo scritte: sono imposte su **due livelli**.

1. **Claude Code**: `.claude/settings.json` nega i comandi pericolosi (Appendice A.5).
2. **GitHub**: il ruleset su `main` rifiuta push diretti e merge senza CI verde (Appendice A.6). È la garanzia vera, perché vale per chiunque e qualunque strumento.

### 5.4 Claude su GitHub (opzionale)

Installare la GitHub Action di Claude per poter scrivere `@claude` nei commenti di issue e PR e affidare task anche senza aprire Claude Code in locale. Procedura nell'Appendice A.10; da fare dopo la Fase 3, quando il flusso base funziona.

---

## 6. Fasi

Ogni fase si chiude con una PR (o poche) e un criterio di completamento verificabile.

### Fase 0 — Account e strumenti _(Pietro, ~1–2 ore)_

Procedura completa, passo passo, nell'**Appendice A**. In sintesi:

- [ ] Computer: Git configurato, Node.js LTS, pnpm, VS Code (A.1)
- [ ] Account GitHub personale con 2FA e GitHub CLI autenticata anche per Git (A.2)
- [ ] Account Vercel **Hobby** creato con GitHub, Vercel CLI autenticata (A.3)
- [ ] Claude Code installato, con accesso tramite piano personale o chiave API (A.4)
- [ ] Decisioni D1 (nome) e D2 (pubblico/privato) prese (§9)
- [ ] (Opz.) Dominio personale acquistato (A.8)

**Fatto quando**: la verifica finale di A.9 passa tutta.

### Fase 1 — Fondamenta del repository _(Claude Code)_

- [ ] Creare il repo con `gh repo create`
- [ ] Scheletro monorepo: pnpm workspaces, Turborepo, `packages/config`
- [ ] TypeScript strict, ESLint, Prettier condivisi
- [ ] `CLAUDE.md` iniziale (vedi §8)
- [ ] `.claude/settings.json` con i permessi del progetto (Appendice A.5), versionato nel repo
- [ ] `docs/piano-di-lavoro.md` (questo file) e `docs/decisioni/`
- [ ] Template di PR e di issue, etichette
- [ ] Dependabot
- [ ] `README.md` con avvio rapido

**Fatto quando**: `pnpm install && pnpm lint && pnpm typecheck` passano su un clone pulito.

### Fase 2 — CI _(Claude Code)_

- [ ] Workflow `ci.yml`: install con cache pnpm, lint, typecheck, test
- [ ] Turborepo esegue solo i task dei pacchetti modificati
- [ ] Badge di stato nel README
- [ ] _(Pietro)_ Protezione di `main` con un ruleset (Appendice A.6): si fa **dopo** il primo giro della CI, perché il controllo obbligatorio va scelto per nome

**Fatto quando**: una PR di prova mostra i controlli verdi e una PR volutamente rotta viene bloccata.

### Fase 3 — Collegamento a Vercel _(Claude Code + Pietro)_

- [ ] Creare `apps/portale` (Nuxt minimale, "Hello")
- [ ] _(Pietro)_ Importare il repo su Vercel e dare accesso alla GitHub App di Vercel (Appendice A.7), progetto `portale` con Root Directory `apps/portale`
- [ ] Collegare la cartella locale al progetto: `vercel link` in `apps/portale`, poi `vercel env pull .env.local` (la cartella `.vercel/` e i file `.env*` restano fuori da Git)
- [ ] Verificare anteprima su PR e produzione su merge
- [ ] Configurare "ignored build step" / Turborepo per evitare build inutili
- [ ] Documentare in `CLAUDE.md` come leggere i log dei deploy

**Fatto quando**: una PR genera un URL di anteprima funzionante e il merge aggiorna la produzione.

### Fase 4 — Portale e layer condiviso _(Claude Code)_

- [ ] `packages/ui` come Nuxt Layer: palette, tipografia, tema chiaro/scuro, layout, header
- [ ] Home del portale con catalogo app letto dal manifest
- [ ] Pagina "chi sono" / about (contenuti di Pietro)
- [ ] SEO di base, favicon, pagina 404
- [ ] Primi test Playwright sull'anteprima

**Fatto quando**: il portale è online con il catalogo (anche solo con "Musica — in arrivo").

### Fase 5 — Database e autenticazione _(quando serve, Claude Code)_

- [ ] _(Pietro)_ Integrazione **Neon** dal Marketplace di Vercel, con branch del DB per le anteprime (Appendice A.7.3)
- [ ] `packages/db`: client Drizzle, schema, script di migrazione
- [ ] Migrazioni applicate in modo controllato (mai automatiche sul DB di produzione senza revisione)
- [ ] **Better Auth** con login GitHub; accesso ristretto all'account di Pietro (o whitelist)
- [ ] Sessione condivisa tra sottodomini (richiede dominio personale)

**Fatto quando**: Pietro fa login sul portale e una tabella di prova è leggibile da un'API.

### Fase 6 — Sotto-app Musica _(Claude Code)_

Vedi §7 per il dettaglio. MVP in un paio di iterazioni, poi evoluzioni guidate dalle issue.

---

## 7. Sotto-app Musica — prima proposta

> **Superata**: la prima sotto-app è **Soundverse** ([ADR 0006](decisioni/0006-soundverse-al-posto-di-musica.md)). Questa sezione resta come riferimento.

### 7.1 MVP: step sequencer

- Griglia **16 step × N tracce** (kick, snare, hi-hat, clap, basso, synth)
- **Play / Stop**, **BPM** regolabile (60–200), **swing**
- Volume e mute per traccia
- Suoni **sintetizzati** con Tone.js (nessun file audio da ospitare)
- Scorciatoie da tastiera (spazio = play/stop)
- Funziona da desktop e da tablet

### 7.2 Iterazioni successive (da trasformare in issue)

1. Salvataggio e caricamento dei pattern (localStorage prima, poi DB con login)
2. Più pattern concatenati → brano (song mode)
3. Traccia melodica con piano roll
4. Effetti: riverbero, delay, filtro
5. Esportazione in WAV
6. Input da tastiera MIDI (Web MIDI API)
7. Condivisione di un pattern tramite link

### 7.3 Note tecniche

- L'audio parte solo dopo un'interazione dell'utente (vincolo dei browser): pulsante di avvio.
- Timing affidato al clock di Tone.js (`Transport`), non a `setInterval`.
- Stato del sequencer in uno store (Pinia) serializzabile in JSON: base per salvataggio e condivisione.
- Nessun carico sulle funzioni Vercel: l'app è quasi interamente statica.

---

## 8. `CLAUDE.md` — contenuto iniziale

Il file vive nella radice del repo ed è la memoria operativa del progetto. Contenuti minimi:

- Scopo del progetto in tre righe e link a questo piano
- Comandi: `pnpm dev --filter <app>`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- Struttura del monorepo e dove va ogni cosa
- Convenzioni di branch, commit, PR (§5.2)
- Regole su cosa Claude può e non può fare (§5.3)
- Checklist prima di aprire una PR: lint, typecheck, test, build locale dell'app toccata, descrizione PR completa
- Vincoli del free tier (§9)
- Registro delle decisioni: rimando a `docs/decisioni/`

Si aggiorna ogni volta che si prende una decisione o si scopre qualcosa di utile.

---

## 9. Vincoli e decisioni aperte

### 9.1 Limiti da rispettare (piani gratuiti)

- **Vercel Hobby**: solo uso personale e non commerciale; durata massima delle funzioni limitata (fino a 60 s); una build alla volta; limiti mensili su invocazioni e traffico; se si superano, il servizio si ferma fino al mese successivo. → Tenere le API leggere, l'audio nel browser.
- **Neon free**: spazio e compute limitati, il DB va in sospensione quando inattivo (primo accesso più lento).
- **GitHub Actions**: minuti illimitati per repo pubblici; quota mensile limitata per repo privati.
- _I limiti cambiano: verificarli sulle pagine ufficiali prima di ogni scelta che ne dipende._

### 9.2 Decisioni da prendere

| #   | Decisione               | Opzioni                                                                                                                             | Proposta                                                                                    |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D1  | Nome del sito / repo    | —                                                                                                                                   | ✅ **StrangeVerse** — `strangeverse` ([ADR 0001](decisioni/0001-nome-e-visibilita-repo.md)) |
| D2  | Repo pubblico o privato | Pubblico: protezione dei branch e Actions illimitate gratis. Privato: la protezione dei branch richiede un piano GitHub a pagamento | ✅ **Pubblico** ([ADR 0001](decisioni/0001-nome-e-visibilita-repo.md))                      |
| D3  | Dominio personale       | `vercel.app` gratis / dominio ~10 €/anno                                                                                            | Dominio, appena serve il login condiviso                                                    |
| D4  | Lingua dell'interfaccia | Italiano / inglese / entrambe                                                                                                       | Italiano, i18n predisposta                                                                  |
| D5  | Autenticazione          | Nessuna / solo Pietro / utenti aperti                                                                                               | Solo Pietro all'inizio                                                                      |

---

## 10. Come partire con Claude Code

1. Completare la Fase 0 seguendo l'Appendice A (A.1–A.4, poi la verifica A.9).
2. Creare una cartella vuota, copiarci questo file, aprire Claude Code lì (`claude` dal terminale).
3. Primo messaggio suggerito:

   > Leggi `piano-di-lavoro.md`. Il nome del progetto è `strangeverse`, il repo sarà `<pubblico|privato>`. Esegui la Fase 1 e la Fase 2 seguendo il piano: crea il repository con `gh`, prepara lo scheletro del monorepo e la CI, sposta questo file in `docs/`, scrivi `CLAUDE.md`, e apri una Pull Request. Fermati prima del merge e dimmi come verificare.

4. Da lì in poi: una fase o una issue alla volta.

---

## Appendice A — Guida di setup passo passo

Legenda: 🧑 = lo fa Pietro (click, login, decisioni) · 🤖 = può farlo Claude Code · ✅ = come verificare.

Ordine consigliato: **A.1 → A.4 e A.9 prima di iniziare**; A.5 durante la Fase 1; A.6 dopo la Fase 2; A.7 in Fase 3 (e A.7.3 in Fase 5); A.8 e A.10 quando servono.

> Comandi e schermate dei servizi cambiano nel tempo: in caso di differenze, fa fede la documentazione ufficiale di ciascun servizio.

### A.1 Il computer 🧑

**Git**

- macOS: `xcode-select --install` (oppure Homebrew: `brew install git`). Windows: installer da git-scm.com (consigliato usare anche WSL2). Linux: pacchetto della distribuzione.
- Configurazione una tantum:
  ```bash
  git config --global user.name "Nome Cognome"
  git config --global user.email "email-usata-su-github@esempio.it"
  git config --global init.defaultBranch main
  ```
  Suggerimento: su GitHub → Settings → Emails si può usare l'indirizzo `…@users.noreply.github.com` per non esporre l'email nei commit pubblici.

**Node.js e pnpm**

- Installare la versione **LTS** di Node.js, preferibilmente con un gestore di versioni (`fnm` o `nvm`), così si cambia versione senza problemi.
- Attivare pnpm: `corepack enable pnpm` (se `corepack` non è disponibile: `npm install -g pnpm`).

**Editor**

- VS Code con le estensioni: _Vue (Official)_, _ESLint_, _Prettier_.

✅ `git --version`, `node --version` (LTS), `pnpm --version` rispondono.

### A.2 GitHub 🧑

1. Account **personale** su github.com (non un'organizzazione: il piano Hobby di Vercel è pensato per repo dell'account personale).
2. Attivare l'**autenticazione a due fattori**: Settings → Password and authentication (app di autenticazione o passkey).
3. Installare la **GitHub CLI** (`brew install gh`, `winget install GitHub.cli`, o pacchetto Linux).
4. Autenticarsi:
   ```bash
   gh auth login
   ```
   Risposte: _GitHub.com_ → protocollo _HTTPS_ → **"Authenticate Git with your GitHub credentials?" → Yes** → _Login with a web browser_.
   Così anche `git push` funziona senza configurare chiavi SSH.

✅ `gh auth status` mostra l'account e "Git operations protocol: https".

### A.3 Vercel 🧑

1. Su vercel.com → _Sign Up_ → piano **Hobby** → _Continue with GitHub_ (stesso account di A.2).
2. **Non** importare ancora nessun progetto: lo facciamo in Fase 3 (A.7).
3. Installare e autenticare la CLI:
   ```bash
   npm install -g vercel
   vercel login
   ```

✅ `vercel whoami` mostra il tuo utente.

### A.4 Claude Code 🧑

1. **Accesso**: serve un piano Claude che includa Claude Code (es. Pro o Max) oppure una chiave API della Claude Console con credito. Essendo un progetto personale, conviene usare un account personale e non quello aziendale: verificare le condizioni del proprio piano.
2. **Installazione**: seguire la guida ufficiale su docs.claude.com (sezione Claude Code) per il proprio sistema operativo.
3. **Primo avvio**: da terminale, in una cartella qualsiasi, `claude` → completare il login nel browser.
4. (Consigliato) Installare l'integrazione con VS Code per vedere le modifiche di Claude direttamente nell'editor.

✅ `claude --version` risponde e, avviando `claude`, la sessione parte senza chiedere di nuovo il login.

### A.5 Permessi di Claude Code nel progetto 🤖 (Fase 1, Pietro rivede)

File `.claude/settings.json` nella radice del repo, versionato. Base di partenza:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm typecheck:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm build:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(gh pr view:*)",
      "Bash(gh pr checks:*)"
    ],
    "deny": [
      "Bash(gh pr merge:*)",
      "Bash(git push origin main:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(gh repo delete:*)",
      "Bash(vercel --prod:*)",
      "Bash(vercel deploy --prod:*)",
      "Bash(vercel env add:*)",
      "Bash(vercel env rm:*)",
      "Bash(vercel remove:*)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./**/.env*)"
    ]
  }
}
```

- `allow`: comandi di routine che Claude esegue senza chiedere ogni volta.
- `deny`: comandi bloccati. Tutto ciò che non è in nessuna delle due liste resta **su richiesta di conferma**.
- Le regole lavorano per prefisso: una variante scritta diversamente potrebbe sfuggire. Per questo la garanzia vera è il ruleset di GitHub (A.6).
- Preferenze personali (non da condividere) vanno in `.claude/settings.local.json`, escluso da Git.

✅ Chiedere a Claude di eseguire `gh pr merge` su una PR di prova: deve essere bloccato.

### A.6 Protezione di `main` 🧑 (dopo la Fase 2)

Disponibile gratis sui **repo pubblici**; sui privati serve un piano GitHub a pagamento (decisione D2).

1. Repo → _Settings_ → _Rules_ → _Rulesets_ → _New branch ruleset_.
2. Nome: `protezione-main` · Enforcement: _Active_ · Target: _Default branch_.
3. Attivare:
   - _Restrict deletions_
   - _Block force pushes_
   - _Require a pull request before merging_ (approvazioni richieste: 0, dato che il revisore sei tu stesso)
   - _Require status checks to pass_ → aggiungere il job della CI (compare nell'elenco solo dopo che la CI ha girato almeno una volta)
4. Salvare.

✅ Un `git push origin main` diretto viene rifiutato; una PR con CI rossa non è unibile.

### A.7 Collegamenti di Vercel 🧑 (Fase 3)

**A.7.1 Import del repository**

1. Dashboard Vercel → _Add New…_ → _Project_ → _Import Git Repository_.
2. Alla richiesta, installare la **Vercel GitHub App** scegliendo _Only select repositories_ → selezionare il repo del sito.
3. Configurazione del progetto: nome `portale` (o `strangeverse`) · Framework: _Nuxt_ (rilevato da solo) · **Root Directory: `apps/portale`**.
4. _Deploy_.
5. Per ogni nuova sotto-app si ripete l'import dello **stesso repo**, cambiando nome del progetto e Root Directory.

**A.7.2 Collegamento locale** 🤖

```bash
cd apps/portale
vercel link          # associa la cartella al progetto Vercel
vercel env pull .env.local
```

`.vercel/` ed `.env*` devono essere in `.gitignore`.

**A.7.3 Database Neon** 🧑 (Fase 5)

1. Progetto Vercel → _Storage_ (o _Marketplace_) → **Neon** → _Create_ → piano gratuito, regione vicina (es. Europa).
2. Collegarlo ai progetti che ne hanno bisogno; attivare la creazione di un **branch del database per i deploy di anteprima**.
3. Le variabili di connessione vengono aggiunte da sole al progetto Vercel; in locale si recuperano con `vercel env pull`.

✅ La PR di prova ha un commento/stato di Vercel con l'URL di anteprima; il merge aggiorna l'URL di produzione.

### A.8 Dominio personale (opzionale) 🧑

1. Acquistarlo da un registrar a scelta (o direttamente da Vercel).
2. Progetto `portale` → _Settings_ → _Domains_ → aggiungere `dominio.it` (e `www.dominio.it`).
3. Progetto `musica` → aggiungere `musica.dominio.it`.
4. Configurare i DNS con **i record che Vercel mostra** (di solito un record A per il dominio principale e un CNAME per i sottodomini), oppure delegare il dominio ai nameserver di Vercel.
5. Il certificato HTTPS è automatico.

✅ `https://dominio.it` e `https://musica.dominio.it` rispondono con lucchetto valido.

### A.9 Verifica finale della Fase 0

Tutti questi comandi devono rispondere senza errori:

```bash
git config --global user.email   # la tua email
node --version                   # versione LTS
pnpm --version
gh auth status                   # loggato, protocollo https
vercel whoami                    # il tuo utente
claude --version
```

### A.10 GitHub Action di Claude (opzionale, dopo la Fase 3) 🧑 + 🤖

1. Dentro Claude Code, nel repo: comando `/install-github-app`.
2. Seguire la procedura: installa la **Claude GitHub App** sul repository e salva le credenziali come **segreto del repository** (token del piano o chiave API, a seconda dell'accesso scelto in A.4).
3. Claude Code apre una PR con il workflow: rivederla e fare merge.
4. Da quel momento si può scrivere `@claude` in una issue o PR.

Nota: l'Action consuma minuti di GitHub Actions (illimitati sui repo pubblici) e utilizzo del piano Claude o credito API.

✅ Un commento `@claude spiega cosa fa questo repo` in una issue riceve risposta.

### A.11 Cosa non va mai nel repository

- File `.env`, `.env.local`, token, chiavi API, password.
- La cartella `.vercel/`.
- `.claude/settings.local.json`.

Se un segreto finisce per errore in un commit: **revocarlo e rigenerarlo subito** dal servizio che lo ha emesso; cancellarlo dalla cronologia non basta.
