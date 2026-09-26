# 0001 — Nome del progetto e repository pubblico

- **Stato**: Accettata
- **Data**: 2026-09-26
- **Decisioni del piano**: D1, D2 (§9.2)

## Contesto

Servivano un nome per il sito, il repository e i pacchetti, e una scelta sulla visibilità del repository.

## Decisione

- Nome: **StrangeVerse**. Repository `StrangeVerse76/strangeverse`, pacchetti con scope `@strangeverse/*`.
- Repository **pubblico**.

## Conseguenze

- Protezione di `main` con i ruleset e minuti di GitHub Actions illimitati, gratis.
- Tutto ciò che è nel repo è visibile a chiunque: i segreti vivono solo su Vercel (Appendice A.11 del piano).
- I commit usano l'indirizzo `…@users.noreply.github.com`, per non esporre email personali o di lavoro.
