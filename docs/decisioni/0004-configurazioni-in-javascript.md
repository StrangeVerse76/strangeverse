# 0004 — `packages/config` in JavaScript con JSDoc

- **Stato**: Accettata
- **Data**: 2026-09-26

## Contesto

Il piano prevede TypeScript ovunque. Le configurazioni di ESLint e Prettier però vengono caricate direttamente da Node, senza passare da un bundler, e Node non rimuove i tipi dai file che stanno in `node_modules`.

## Decisione

I file di configurazione in `packages/config` sono **JavaScript con tipi JSDoc**, controllati da `tsc` con `checkJs` e `strict`. I test sono in TypeScript. Il codice delle app resta tutto in TypeScript.

## Conseguenze

Il controllo dei tipi è completo, senza passaggi di build per le configurazioni condivise.
