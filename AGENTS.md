# Consignes pour travailler sur Sylloge

## Références du projet

Avant un changement qui touche au produit, consulter :

1. docs/ROADMAP.md pour le périmètre confirmé et le prochain lot ;
2. docs/WORKFLOW.md pour les pratiques de travail ;
3. DESIGN.md pour la base visuelle ;
4. docs/I18N.md pour les langues de l’interface ;
5. README.md et les contrats de données concernés.

Les documents sous docs/archive et les anciens plans sous docs/plans sont historiques. Ils ne créent pas de tâche active ni de règle actuelle.

## Base produit

- Application personnelle locale sur Mac.
- Sept bibliothèques de base : Films, Séries, Animation japonaise, Livres, Mangas, Jeux et Art. Une seule base `sylloge.db`, une table par bibliothèque (`films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`). Une bibliothèque n’est jamais une simple valeur de catégorie dans la table d’une autre : toute nouvelle bibliothèque suit ce modèle.
- Bibliothèques personnalisées (22 octobre 2026) : modèles prêts qu’un profil ajoute par le « + » de la barre latérale. Neuf modèles (huit en migration 0021, `recipes` en 0022), une table chacun (`comics`, `magazines`, `audiobooks`, `music`, `podcasts`, `documentaries`, `shows`, `board_games`, `recipes`), liste par profil dans `profile_libraries` dont la contrainte CHECK se reconstruit à chaque nouveau modèle. Le catalogue est dans `src/domain/customLibraries.ts` ; un champ `textarea` porte les textes longs, un champ `list` les édite une ligne par élément (Entrée ouvre la ligne suivante, Retour arrière la retire) — les deux sont enregistrés comme le même texte multiligne, tel que saisi. Ajouter un modèle touche : la migration, `CUSTOM_LIBRARIES` (portability.rs), les listes des tests Rust, le catalogue, l’icône, les traductions et `CUSTOM_TABLES` du simulateur ; les suppressions et décomptes de profil dérivent de `CUSTOM_LIBRARIES`. Les comics ont leur bibliothèque : Livres n’a plus de catégorie Comics.
- Recettes de cuisine (24 octobre 2026) : une recette s’essaie, se teste puis se maîtrise — trois états seulement (`à découvrir`, `terminé`, `maîtrisée`), sans « en cours » ni « écartée ». `maîtrisée` n’existe que dans la table `recipes` (migration 0023) : `isStatusAllowedFor()` garde cette frontière côté TS, `custom_entries.rs` côté écriture, les contraintes CHECK côté base. `showsYear` et `showsSummary` retirent de ce modèle les champs qui n’ont pas de sens pour une recette (le millésime et le résumé séparé). Les vues d’une bibliothèque personnalisée sont une rangée unique qui défile avec flèches : « Tous », chaque statut, puis chaque valeur du filtre principal (type de plat, format, salle…), combinables, avec le tri à droite.
- Visuels (23 octobre 2026) : un visuel est l’adresse d’une image, jamais un fichier ; rien n’est téléchargé. Pour un film, un lien personnel passe devant le choix de la galerie TMDB puis l’affiche principale, par une règle unique (`src/domain/filmPoster.ts`) ; la commande native `set_film_tmdb_poster` ne sert qu’aux affiches du cache. Détail : docs/COUVERTURES.md.
- Une seule direction visuelle pour toute l’application, accueil compris : monochrome neutre et froid (décision du 16 octobre 2026). Les écrans peuvent être recomposés quand l’usage le justifie ; les fonctions, les données et les sept bibliothèques sont préservées. DESIGN.md décrit le système en vigueur.
- Cible desktop macOS et Windows (arbitrage du 23 octobre 2026). La présentation mobile n’est plus maintenue comme cible. macOS publie une archive universelle ; Windows un installeur NSIS signé. Les deux plateformes se mettent à jour par le même `latest.json`.
- Une seule release (`.github/workflows/release.yml`) : un lancement manuel seulement, mode « release » pour publier ou « build » pour vérifier sans publier. macOS et Windows construisent en parallèle, puis un troisième job assemble `latest.json` (darwin-aarch64, darwin-x86_64, windows-x86_64), vérifie les trois cibles et seulement ensuite ouvre la release. Un build Windows en échec bloque la publication : aucune release partielle ne doit atteindre les personnes. Le tag créé par `gh release create` ne déclenche aucun workflow — ne pas compter sur un enchaînement macOS → Windows par événement de tag. Détail : docs/UPDATER.md.
- Interface en français et en anglais (décision du 23 octobre 2026) : langue détectée au premier lancement, choix dans Paramètres › Général. Tout texte visible passe par `t()`, `tc()` ou `translateMessage()` avec son entrée anglaise ; les données de la personne (titres, avis, notes, citations, noms de profils et de vues) et les valeurs stockées ne se traduisent jamais. Règles et contrôles : docs/I18N.md ; `npm run test:i18n` doit rester vert.
- Ne pas élargir le périmètre vers de nouveaux médias ou modèles, comptes, synchronisation, cloud ou distribution publique sans décision explicite.

## Données et sécurité

- Ne pas ouvrir, modifier, copier ou utiliser les données personnelles réelles pour les essais.
- Garder les essais dans un dossier et un profil temporaires isolés.
- Les clés fournisseur sont locales et ignorées par Git. Ne pas les afficher, les demander dans le chat, les copier dans des fichiers suivis ou envoyer des requêtes réelles pour une validation ordinaire.
- Préserver les formats existants. Examiner le contrat concerné avant de changer un import, un export ou une migration SQLite. Le document de profil est en v5 depuis le 23 octobre 2026 (vues enregistrées et préférences d’affichage) ; les versions 1 à 4 restent lisibles. Ce qui voyage et ce qui reste sur la machine : docs/PORTABILITE.md.
- Ne jamais remplacer ou fusionner une bibliothèque sans choix explicite de la personne.
- Liens externes : écrire un `<a href="https://…">` ordinaire. `installExternalLinks()` (src/data/externalLinks.ts) le confie au navigateur du système dans la fenêtre native, où un `target="_blank"` ne fait rien. Ne pas appeler `window.open`, et n'ouvrir que du `https`.
- Champs de formulaire : l'anneau de focus se dessine dans la boîte (`inset`), jamais en débord, sinon un conteneur défilant le rogne.
- Cartes à partager : la sélection (`shareCard.ts`) et la mise en page (`shareCardLayout.ts`) sont pures et testées en Node ; le canevas ne décide de rien. Toute image dessinée se charge avec `crossOrigin` (sinon le canevas est contaminé et le PNG impossible) et retombe sur le titre si le serveur refuse. Aucun envoi réseau.
- Cartes à partager : le logo de la carte est la tuile Σ de l'application (`src/assets/sylloge-mark.png`, tirée de l'icône), jamais l'ancien marque-page `logo-sylloge.png`. Deux formats seulement (standard 1 080 × 1 350, story 1 080 × 1 920) ; chaque destination impose le sien. Le presse-papiers n'accepte l'écriture que dans le geste du clic : `shareActions.ts` la demande tout de suite avec une promesse d'image, jamais après avoir attendu le dessin.
- Exports vers un service tiers : un module de domaine par service (`letterboxdExport.ts`), sérialiseur CSV dédié (pas de préfixe de protection de tableur), colonnes tirées de la documentation officielle du service, bilan de ce qui n'est pas parti, tests rédigés avant le code.
- Recettes navigateur : ne jamais remplacer une méthode d'un module importé par la recette (l'application peut en tenir un autre exemplaire après un rechargement à chaud : le module porte alors un `?t=…`) ; préférer un scénario du harnais. Ne dépendre d'aucun service externe (simuler les images par `page.route`) et retirer toute interception en sortie (`page.unroute`), sinon les recettes suivantes de la même session sont faussées.

## Changements et vérification

- Explorer seulement les fichiers utiles au lot et suivre les outils déjà utilisés par le dépôt.
- Pour une modification d’interface, vérifier les parcours visés avec des données factices et examiner le rendu quand l’environnement le permet.
- Pour du code, lancer les contrôles pertinents : npm run typecheck, npm run verify, npm run build et les commandes Cargo concernées. Un clone propre peut manquer les modules locaux ignorés contenant des secrets. Rapporter cette limite clairement, ne pas la masquer.
- Ne pas commit, fusionner, taguer ou pousser sans demande explicite. Un push sur `main` ne publie plus rien : la release se déclenche à la main.
- Pour une vérification visuelle, ouvrir `qa-app.html` avec `npm run dev` : la vraie application y tourne avec une base SQLite en mémoire et des données factices (`?scenario=full`, `empty` ou `onboarding`). Arrêter le serveur après usage.
- À la fin, indiquer les fichiers modifiés, les vérifications réellement exécutées et les limites restantes.
