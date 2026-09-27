# 0009 — Merge autonomo di Claude, con condizioni

- **Stato**: Accettata
- **Data**: 2026-09-27
- **Modifica**: principio 3 e §5.3 del piano

## Contesto

Il piano prevedeva che ogni merge su `main` lo facesse Pietro. Col flusso ormai rodato (CI, anteprime Vercel, e2e) questo passaggio rallentava il lavoro senza aggiungere controlli reali, e Pietro ha chiesto a Claude di fare il merge in autonomia.

## Decisione

- Claude fa il merge (squash) quando la CI è verde, le anteprime Vercel sono completate e le ha controllate.
- Restano a Pietro le PR che toccano CI (`.github/`), permessi (`.claude/settings.json`), configurazione di Vercel o GitHub, protezioni o segreti; gli aggiornamenti major delle dipendenze; le PR che Pietro vuole provare prima.
- `gh pr merge` passa dalla lista `deny` alla lista `allow` di `.claude/settings.json`.

## Conseguenze

- Un merge su `main` va subito in produzione: Claude verifica la produzione dopo ogni merge e riferisce.
- Il ruleset `protezione-main` resta invariato: PR obbligatoria e CI verde valgono per chiunque, Claude compreso.
- Le regole su cosa Claude può cambiare da solo restano quelle di `CLAUDE.md`. Questa PR, che tocca `.claude/settings.json`, la unisce Pietro.
