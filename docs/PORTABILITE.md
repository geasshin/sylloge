# Portabilité d’un profil

## Ce que l’application sauvegarde

Un seul fichier JSON par profil, `sylloge-library`, version **5** depuis le 23 octobre 2026.
Les versions 1 à 4 restent lisibles : un document plus ancien s’importe, sans expérience.

| Contenu | Porté depuis |
| --- | --- |
| Profil (nom, avatar), sept bibliothèques de base, bibliothèques personnalisées, notes, avis, notes personnelles, dates, citations | v1 pour les films, v3 pour les sept sections, v4 pour les bibliothèques personnalisées |
| Vues enregistrées (nom, bibliothèque, filtres et tri) | **v5** |
| Préférences d’affichage : thème, langue, lecture automatique de l’accueil, barre latérale épinglée | **v5** |
| Recettes de cuisine (`customLibraries`, identifiant `recipes`) : ingrédients et étapes en textes longs conservés ligne pour ligne, photo en lien | v5, ajoutées le 23 octobre 2026 |

Le brief 0.4.21 gardait les vues locales, hors des copies et des exports. L’objectif
« portabilité intégrale de l’expérience » l’a renversé le 23 octobre 2026 : une vue
enregistrée est un travail de la personne, pas un réglage de cette machine.

## Ce qui reste sur la machine, volontairement

| Réglage | Pourquoi il ne voyage pas |
| --- | --- |
| Dossier de sauvegarde (`backup_settings`) | C’est un chemin absolu de la machine d’origine : restauré ailleurs, il désignerait un dossier absent. Il se règle à l’ouverture du profil restauré. |
| Liste des copies existantes | Elle décrit un dossier, pas un profil. |
| Cache de métadonnées TMDB, affiches téléchargées | Caches : se reconstruisent à la demande. |
| Version ignorée du vérificateur de mise à jour | Elle vaut pour une version publiée à un instant donné. La recopier masquerait une mise à jour attendue ailleurs. |
| Taille et position des fenêtres | Sans intérêt d’une machine à l’autre. |

Les couvertures et photos sont des **adresses**, jamais des fichiers : la sauvegarde ne contient aucune image ([COUVERTURES.md](COUVERTURES.md)). Une sauvegarde qui contient des recettes n’est pas lisible par une version de l’application antérieure au 23 octobre 2026 (bibliothèque inconnue) ; le format reste en v5.

Un document v5 écrit par un chemin qui ne collecte rien (export d’une seule collection)
porte `"experience": { "version": 1, "savedViews": [], "preferences": {} }` : cela se lit
« ce document ne porte aucune expérience », jamais « préférences perdues ».

## Restauration

1. Le fichier est validé d’abord (`validateLibraryDocument`) : format, version, sections,
   champs. Une erreur bloque l’import, rien n’est écrit.
2. Les fiches sont importées nativement et atomiquement ; le rapport SQLite est comparé au
   document validé (un écart annule l’import).
3. L’expérience est restaurée **après** un import réussi, et seulement ensuite :
   - les vues sont recréées dans le profil restauré ; un nom déjà pris reçoit un suffixe
     ` (2)`, ` (3)`… plutôt que d’écraser une vue existante ou d’être perdue ;
   - les préférences d’affichage prennent effet immédiatement (thème par `data-theme`,
     langue par son magasin) et sont écrites dans le stockage local, relues au lancement
     suivant.
4. Un échec de cette troisième étape ne remet pas en cause les fiches : il est journalisé
   et n’interrompt pas la restauration.

## Vérifications

- `npm run test:portability` : aller-retour des sept bibliothèques et des champs personnels,
  v1 à v5, et `scripts/profile-experience.test.mjs` pour l’expérience (document v5, document
  v4 sans experience, préférence abîmée écartée sans perte, conflit de nom).
- `npm run verify` : contrats de données, migrations et sérialisation.
- Ce qui n’est pas couvert : le parcours de restauration complet dans l’interface native
  (dialogue de fichier macOS ou Windows, écriture réelle du fichier de sauvegarde). Le
  harnais `qa-app.html` reconstruit sa base en mémoire à chaque chargement.
