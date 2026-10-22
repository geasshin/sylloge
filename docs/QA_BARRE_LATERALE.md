# Barre latérale Îlot — recette locale

Choix d’Aurélien : Îlot (panneau flottant), pictogrammes Phosphor validés sauf l’étoile d’Animation japonaise. Implémenté localement le 22 octobre 2026 ; aucune publication.

## Livraison

- `src/components/FloatingSidebarFrame.tsx` : survol temporisé (140ms / 220ms), ouverture par le focus clavier, Échap, épingle et préférence locale `sylloge-sidebar-pinned`, nettoyage du temporisateur. L’ouverture temporaire recouvre la page ; l’épingle réserve la largeur complète. Paramètres conserve sa navigation indépendante.
- `src/main.tsx` : intégration sur les vrais boutons existants, groupes Bibliothèques / Ajoutées, épingle, pictogramme plein pour la destination active et conservation des actions existantes.
- `src/styles.css` : rail 62px, panneau 236px, marge extérieure 10px, rayon 20px, ombre thémée. SVG de 20px en bloc (corrige leur décalage de ligne de base) ; noms et compteurs en fondu ; réduction du mouvement respectée. La liste centrale défile si nécessaire, le pied reste fixe. Une petite fenêtre resserre les rangées quand de nombreuses bibliothèques sont présentes.
- `src/components/icons.tsx`, `navigationIconPaths.ts`, `CustomLibraryIcon.tsx` : Phosphor régulier / plein ; Animation japonaise = dessin original de cellulos superposés avec un signe de lecture, sans étoile. Dessins embarqués localement, aucune dépendance ajoutée. Licence MIT complète : `docs/licenses/phosphor-icons.txt`.
- Le prototype et son sélecteur sont retirés du dépôt (archive de sécurité dans le scratch de la session). Aucun import de production ne dépend de ce prototype.

## Preuves exécutées

- `scripts/qa-sidebar.js` sur la vraie application de recette : **34 assertions réussies**. Nouveau profil limité aux sept bibliothèques + « + », survol sans déplacement de la page, épingle, persistance après rechargement, retour au rail, navigation au clavier, paramètres et retour, catalogue et restauration du focus après Échap. Ajout des huit bibliothèques optionnelles puis contrôle de chaque destination de la liste défilante à 1000 × 760 et navigation clavier ; pied indépendant sans chevauchement.
- Matrice navigateur : **98 assertions réussies**, clair et sombre, 1440 × 900 et 1000 × 760, rail / survol / épingle. Destination active vérifiée pour les sept bibliothèques de base et les quatre personnalisées du scénario complet ; taille SVG 20px, décalage vertical de leur boîte 0px ; noms complets dans le panneau ouvert, pied visible, aucun débordement horizontal, réduction du mouvement respectée. Captures réellement examinées. Ceci mesure le centrage de la boîte SVG ; les asymétries optiques intrinsèques des dessins ne sont pas toutes nulles.
- `qa-custom-libraries.js` : **24 contrôles réussis** (ajout, navigation, édition, citations, sauvegarde, restauration et suppression dans la base mémoire).
- `qa-library-toolbar.js` : **112 cas / 860 assertions réussis**, aucune erreur de page ni requête inattendue. Les barres d’outils peuvent passer sur deux lignes dans les états étroits prévus par le contrat existant.
- `npm run typecheck`, `npm run build`, `npm run verify` : réussis, **94 tests Node**. Le build garde son avertissement de chunk supérieur à 500kB.
- `node --test scripts/verify-anime-home.mjs` : **5 tests réussis**, dont formes régulière / pleine du nouveau pictogramme.
- Détecteur Impeccable sur le composant, les icônes, `main.tsx` et `styles.css` : aucune remarque. `git diff --check` : réussi.

## Correctifs révélés par la recette

- Passer du clavier à la souris pouvait refermer le panneau entre `pointerdown` et `click`, retirant la cible sous le pointeur. Le panneau reste maintenant ouvert pendant ce geste ; le test Paramètres exerce cette transition.
- À 1000 × 760 avec quatre bibliothèques personnalisées, le bas du bouton « + » était initialement rogné. Rangées compactes activées dans les petites hauteurs pour éviter ce défilement prématuré.
- Les assertions statiques historiques portant sur l’ancien balisage ont été adaptées en conservant leurs garanties : accueil avec son icône, destinations nommées, épingle avec son icône, navigation Paramètres toujours ouverte et sans bascule de réduction.

## Limites

Application native macOS non lancée et aucun build installable produit. Vérification dans `qa-app.html` : vraie interface React, pont Tauri simulé, SQLite en mémoire, données fictives. Aucune base personnelle consultée ou modifiée. Le choix d’épingle est une préférence d’appareil, pas une donnée de profil exportée. Ni commit, ni push, ni déploiement ; serveur de recette arrêté après la validation.
