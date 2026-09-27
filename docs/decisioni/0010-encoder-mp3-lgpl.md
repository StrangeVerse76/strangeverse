# 0010 — Encoder MP3: @breezystack/lamejs (LGPL-3.0)

- **Stato**: Accettata
- **Data**: 2026-09-27
- **Issue**: #26

## Contesto

Scrivere da zero un encoder MP3 non ha senso. Le opzioni realistiche per il browser sono tutte basate su **LAME**, che è LGPL:

| Pacchetto             | Licenza       | Note                                                |
| --------------------- | ------------- | --------------------------------------------------- |
| `lamejs`              | LGPL-3.0      | Non aggiornato dal 2022                             |
| `@breezystack/lamejs` | LGPL-3.0      | Porting JS mantenuto, ESM e tipi                    |
| `wasm-media-encoders` | MIT (wrapper) | Il WebAssembly incluso è LAME, quindi di fatto LGPL |

## Decisione

- Si usa **`@breezystack/lamejs`** (1.2.7), senza modifiche.
- Vive **solo nel chunk del Worker** (`audio/mp3.worker.ts`), che si carica quando si scarica un MP3. Resta una libreria separata e sostituibile, come chiede la LGPL, e non pesa sul resto dell'app. L'ho verificato nella build: l'encoder compare solo in `mp3.worker-*.js`.
- La pagina **Licenze** di Soundverse (`/licenze`, nel menu) dà l'avviso richiesto, con i link alla licenza e al sorgente.

## Conseguenze

- Se in futuro servisse evitare del tutto la LGPL, basterà sostituire il Worker: il resto dell'app parla solo con `encodeMp3()`.
- Ogni nuova dipendenza con una licenza diversa da MIT/BSD/Apache va decisa con un ADR come questo.
