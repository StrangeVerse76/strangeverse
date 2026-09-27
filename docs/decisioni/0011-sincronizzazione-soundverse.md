# 0011 — Sincronizzazione di Soundverse: ricette su Neon, audio importato su Blob

- **Stato**: Accettata
- **Data**: 2026-09-27
- **Issue**: #28, #56

## Contesto

La libreria di Soundverse vive in IndexedDB, quindi un clip creato su un computer non si vede su un altro. I piani gratuiti (verificati il 2026-09-27) sono piccoli:

| Servizio         | Piano gratuito                                                              | Se si supera                |
| ---------------- | --------------------------------------------------------------------------- | --------------------------- |
| Neon             | 0,5 GB per progetto, 100 CU-ora al mese, 10 branch                          | Si ferma fino al mese dopo  |
| Vercel Blob      | 1 GB, 2.000 operazioni "advanced" (caricamenti) e 10 GB di download al mese | Blob bloccato per 30 giorni |
| Vercel Functions | Corpo di richiesta e risposta fino a 4,5 MB                                 | —                           |

Un minuto di audio stereo a 48 kHz e 24 bit occupa circa 17 MB: caricare tutti i clip riempirebbe il gigabyte in circa un'ora di audio.

## Decisione

- **Si sincronizzano le ricette, non l'audio rifacibile.** Synth, batteria, accordi, campioni, mix e pattern dei pad si rigenerano sull'altro dispositivo dalla loro ricetta (`clip.recipe`), con lo stesso grafo usato per crearli (#57).
- **L'audio va su Blob solo per i clip `import` e `recording`**, che non si possono rifare. Si carica il WAV a 24 bit del clip, senza ricompressione.
- **Metadati su Neon** (Postgres, con Drizzle): clip (senza picchi né audio), progetti, kit, eliminazioni. Ogni riga ha `updatedAt`.
- **Blob privato.** Il browser carica direttamente su Blob (client upload, con un token dato dalla nostra API dopo il login) e scarica con **URL firmati** a breve scadenza. Così l'audio non passa dalle funzioni, e il limite di 4,5 MB non conta.
- **Conflitti.** I clip non cambiano mai: ogni operazione ne crea uno nuovo, quindi non ci sono conflitti. Per progetti e kit vince la modifica più recente, e la versione che perde si tiene come copia ("… (conflitto)").
- **Login con GitHub (Better Auth)**, consentito solo all'id GitHub di Pietro. Senza login l'app funziona come oggi, tutta nel browser.
- **Anteprime senza login**: un'app OAuth di GitHub accetta un solo indirizzo di ritorno, e quelli delle anteprime cambiano. Il login c'è in produzione e in locale (due app OAuth). Le anteprime hanno comunque il loro branch del DB, per le migrazioni e gli e2e.
- **Blob condiviso fra ambienti**, con un prefisso per ambiente (`production/`, `preview/`, `development/`).

## Conseguenze

- Rigenerare un clip costa tempo di calcolo sul dispositivo che lo riceve; va fatto in background, uno alla volta.
- La rigenerazione deve dare lo stesso audio: i test di #57 lo verificano per ogni tipo di ricetta. Se un giorno cambia un grafo, i clip vecchi suoneranno in modo diverso: il cambio di un grafo va trattato come una migrazione.
- Con 1 GB restano circa 60 minuti di audio importato o registrato. L'app mostrerà lo spazio usato (#61).
- Le funzioni devono stare vicine al database: la regione delle funzioni di Soundverse va impostata su `fra1` insieme a Neon in Europa (è una configurazione di Vercel, quindi la unisce Pietro).
