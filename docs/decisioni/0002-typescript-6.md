# 0002 — TypeScript fermo alla 6.0

- **Stato**: Accettata
- **Data**: 2026-09-26

## Contesto

L'ultima versione di TypeScript è la 7.0, ma `typescript-eslint` (8.70) supporta solo `typescript >=4.8.4 <6.1.0`.

## Decisione

Si usa **TypeScript 6.0.x** (`~6.0.0` come peer in `@strangeverse/config`).

## Conseguenze

- Lint e typecheck funzionano con lo stesso compilatore.
- Il passaggio alla 7.x si rivaluta quando `typescript-eslint` (e `vue-tsc`, per le app Nuxt) la supporteranno. Dependabot proporrà l'aggiornamento: va accettato solo dopo questa verifica.
