/**
 * Recette : langue de l'application montée dans qa-app.html et qa-integration.html.
 * À importer en premier, avant tout module qui lit src/i18n/core.ts.
 *
 * - `?lang=fr` ou `?lang=en` : impose et mémorise la langue ;
 * - `?lang=auto` : ne touche à rien, la détection réelle du navigateur s'applique
 *   (la liste navigator.languages du contexte Playwright) ;
 * - sans paramètre : français tant qu'aucun choix n'est mémorisé. Les scripts qa-*.js
 *   sont écrits avec les libellés français, et un Chrome de recette annonce `en-US`.
 */
const requested = new URLSearchParams(window.location.search).get('lang')
try {
  if (requested === 'fr' || requested === 'en') window.localStorage.setItem('sylloge-language', requested)
  else if (requested !== 'auto' && window.localStorage.getItem('sylloge-language') === null) window.localStorage.setItem('sylloge-language', 'fr')
} catch {
  // Stockage refusé : la détection du navigateur s'applique.
}
