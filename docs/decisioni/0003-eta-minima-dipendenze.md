# 0003 — Età minima delle dipendenze (pnpm)

- **Stato**: Accettata
- **Data**: 2026-09-26

## Contesto

pnpm 12 rifiuta per impostazione predefinita le versioni pubblicate da meno di un giorno (`minimumReleaseAge`). È una difesa contro i pacchetti compromessi, che di solito vengono scoperti e ritirati entro poche ore.
Quando si installa esplicitamente una versione troppo recente, pnpm aggiunge da solo un'eccezione (`minimumReleaseAgeExclude`) in `pnpm-workspace.yaml`.

## Decisione

- La protezione resta attiva e **non si aggiungono eccezioni**.
- Se l'ultima versione di un pacchetto è troppo recente, si sceglie la precedente.
- Se pnpm aggiunge un'eccezione in `pnpm-workspace.yaml`, la si rimuove prima del commit.

## Conseguenze

Le PR di Dependabot per versioni appena uscite possono fallire in CI per un giorno: si rilanciano il giorno dopo.
