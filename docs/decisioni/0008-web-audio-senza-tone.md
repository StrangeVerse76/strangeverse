# 0008 — Web Audio nativo, senza Tone.js

- **Stato**: Accettata
- **Data**: 2026-09-27
- **Modifica**: tabella dello stack (§3) e note tecniche (§7.3) del piano

## Contesto

Il piano prevedeva Tone.js per l'audio. Soundverse (ADR 0006) ha però un requisito in più: lo stesso grafo audio deve servire sia per l'ascolto dal vivo (`AudioContext`) sia per il render dei file (`OfflineAudioContext`). In Bragi le due implementazioni separate si erano allontanate su riverbero, delay, bitcrush, rumore e filtri.

## Decisione

- Soundverse usa le **Web Audio API native**, senza Tone.js.
- Un modulo di Soundverse costruisce i grafi a partire da una spec JSON e riceve il contesto (live oppure offline) come parametro.
- La temporizzazione è affidata al clock dell'`AudioContext` (`currentTime` e scheduling anticipato), mai a `setInterval`. Lo scheduler è piccolo e scritto da noi, con i test sui casi noti: ripresa a metà giro e dissolvenze.

## Conseguenze

- Nessuna dipendenza pesante e controllo completo sul grafo, che resta identico dal vivo e offline.
- Lo scheduler e alcuni nodi (per esempio i filtri con curve precise) sono da scrivere e testare a mano.
- Se servirà qualcosa che Tone.js dà già pronto (per esempio sintetizzatori polifonici complessi), si rivaluterà con un nuovo ADR.
