# 0007 — Vercel Authentication solo sulle anteprime

- **Stato**: Accettata
- **Data**: 2026-09-27
- **Collegata a**: D3 (dominio personale)

## Contesto

Il nome `strangeverse.vercel.app` è già usato da un altro sito, quindi Vercel ha dato al progetto l'indirizzo `strangeverse-strange-verse.vercel.app`. Con la protezione predefinita (_Standard Protection_) anche quell'indirizzo di produzione richiedeva il login a Vercel: il sito non era pubblico.

## Decisione

La _Vercel Authentication_ del progetto `strangeverse` protegge **solo i deploy di anteprima** (`deploymentType: preview`). La produzione è pubblica.

## Conseguenze

- Il sito è raggiungibile da chiunque su https://strangeverse-strange-verse.vercel.app.
- Le anteprime delle PR restano visibili solo a chi è loggato su Vercel.
- Se arriverà un dominio personale (D3), questa impostazione si potrà rivalutare.
- Ogni nuovo progetto Vercel (una per sotto-app) va configurato allo stesso modo.
