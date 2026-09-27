export default defineAppConfig({
  site: {
    name: 'StrangeVerse',
    /** Nome della sotto-app, mostrato accanto al marchio; vuoto nel portale. */
    appName: '',
    /** Indirizzo del portale: `/` nel portale stesso, URL completo nelle sotto-app. */
    homeUrl: '/',
    repoUrl: 'https://github.com/StrangeVerse76/strangeverse',
    /** Voci del menu nell'header; ogni app definisce le sue. */
    nav: [] as { label: string; to: string }[],
  },
})
