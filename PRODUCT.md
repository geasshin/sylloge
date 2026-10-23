# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Une seule personne : Aurélien, qui tient sa bibliothèque culturelle personnelle sur son Mac. L’application gère jusqu’à cinq profils locaux, mais l’usage réel est individuel. Il y revient après avoir vu, lu, joué ou découvert une œuvre, pour la noter, l’annoter, et pour choisir quoi regarder ou lire ensuite.

## Product Purpose

Sylloge rassemble en un seul endroit sept bibliothèques de base : Films, Séries, Animation japonaise, Livres, Mangas, Jeux et Art, auxquelles chaque profil peut ajouter des bibliothèques personnalisées tirées de modèles prêts (Comics, Musique, Podcasts, Spectacles…). Pour chaque œuvre, elle conserve le statut, la note sur cinq, le coup de cœur, la critique personnelle, les dates et la progression ; livres et mangas gardent aussi des citations. Réussir, c’est que la collection soit agréable à parcourir, que l’ajout et la mise à jour d’une œuvre prennent quelques secondes, et que la mémoire personnelle (avis, dates, activité) soit mise en valeur.

## Positioning

Une médiathèque personnelle locale qui couvre sept bibliothèques, sans compte ni cloud : une base SQLite unique dans laquelle chaque bibliothèque a sa propre table, source de vérité sur le Mac. Les services de métadonnées (TMDB pour Films, Séries et Animation japonaise, Open Library pour Livres et Mangas, IGDB pour Jeux) servent seulement à préremplir une fiche après un choix explicite. L’Art n’a pas de fournisseur : ses visuels et informations sont saisis à la main.

## Operating Context

- Fenêtre d’application de bureau macOS (Tauri). Desktop uniquement : la présentation mobile n’est plus une cible (décision du 16 octobre 2026).
- Parcours fréquents : ouvrir l’accueil pour voir les derniers ajouts et ce qui est en cours ; ajouter une œuvre via la recherche du fournisseur ou à la main ; mettre à jour statut, note et critique depuis la fiche ; filtrer, trier et enregistrer des vues dans une bibliothèque.
- Parcours ponctuels : imports et exports JSON ou CSV, sauvegardes locales, gestion des profils, réglages de mise à jour.
- Chaque push sur `main` publie une mise à jour que l’application installée propose.

## Capabilities and Constraints

- Sept bibliothèques, une table par bibliothèque, pas de compte, pas de synchronisation, pas de cloud sans décision explicite. Une nouvelle bibliothèque crée sa propre table ; elle ne réutilise jamais la table d’une autre via une catégorie.
- Formats d’import et d’export, migrations SQLite et contrats de données préservés sauf besoin démontré.
- Aucune bibliothèque n’est remplacée ou fusionnée sans choix explicite.
- Vues de bibliothèque : vues intégrées, filtres, tris et vues enregistrées par profil et par médium. Décisions du 18 octobre 2026 : le fonctionnement actuel convient, c’est la présentation qui est brouillonne. Les vues doivent être des choix nettement distincts (pas un simple trait sous l’onglet actif), toutes visibles, sélectionnables et créables ; les actions de droite (filtrer, trier, enregistrer, vues supplémentaires « + ») sont à recomposer en un ensemble clair ; les listes déroulantes des filtres prennent un style propre à Sylloge plutôt que l’apparence système. Ajouter la vue intégrée « Cette année » (terminés depuis le 1er janvier). Pas d’affichage en liste : la grille d’affiches suffit. Le bouton d’association automatique reste tel quel.
- Composition à reprendre ensuite (18 octobre 2026) : fiches des cinq médiums, ajout et modification d’une œuvre, import et export. Jugées encore trop peu composées.
- Bibliothèque Art : les vues ne s’affichent pas correctement et le visuel ne peut pas être ajouté à la création (défauts constatés le 16 octobre 2026, correction en cours le 18).
- Registre d’adresse (18 octobre 2026) : ni « tu » ni « vous » ; tournures neutres partout (infinitif, nominal, impersonnel). L’anglais garde la même sobriété : impératif ou tournure impersonnelle.
- Barre des bibliothèques (19 octobre 2026) : « Tout associer » remonte avec Importer / Exporter / Ajouter ; recherche un peu plus large, en pilule ; les vues défilent horizontalement à l’intérieur de leur rangée, c’est accepté.
- Mangas (19 octobre 2026) : Livres et Mangas deviennent deux bibliothèques distinctes dans la barre latérale et un onglet Mangas sur l’accueil. Pas de bibliothèque Comics (Aurélien n’en a aucun). Même table `books`, distinguée par la catégorie existante : aucune migration, formats d’import et d’export inchangés. Les bascules Livre / Manga / Comics disparaissent de la barre des Livres.
- « Cette année » (19 octobre 2026) : garde la date personnelle existante de chaque médium (pour Livres, Mangas et Séries, la date de lecture ou de visionnage saisie sur la fiche). Pas de date de fin ajoutée pour l’instant.
- À terme : fiches modifiables avec des champs personnalisés en nombre libre (dates de début et de fin, etc.), puis bibliothèques personnalisées créées par l’utilisateur. Non planifié, ne pas anticiper.

## Brand Commitments

- Nom : Sylloge. Logo et icônes dans `src/assets/` et `src-tauri/icons/`.
- Interface en français et en anglais (décision du 23 octobre 2026) : langue détectée au premier lancement, choix manuel dans Paramètres › Général, mémorisé sur l’appareil. Le français reste la langue source. Les données de la personne (titres, avis, notes, citations, noms de profils et de vues) ne sont jamais traduites. Voir docs/I18N.md.
- Direction visuelle unique, accueil compris : monochrome neutre et froid, dérivé de l’anthracite des bibliothèques. Le papier chaud et l’accent violet de l’accueil sont abandonnés. La couleur vient des visuels des œuvres, pas de l’interface (décision du 16 octobre 2026).
- Titres de pages et de sections en Syne, en capitales (police locale, introduite en 0.6.4 et conservée). Titres d’œuvres et texte courant en police système.
- Références d’usage citées par Aurélien pour l’accueil : la catégorisation en rangées de Plex et Netflix.
- Pas de surtitre décoratif au-dessus des titres (« Collection personnelle » à supprimer).

## Evidence on Hand

- Aucune donnée personnelle n’est utilisée pour concevoir ou vérifier. Le harnais `qa-app.html` fournit des données factices réalistes (titres réels, notes et avis inventés). Ses visuels sont des photos libres de picsum.photos au format affiche, pas les vraies affiches.
- Captures de l’état 0.6.4 produites le 16 octobre 2026 dans le dossier de recette local (hors dépôt).

## Product Principles

1. L’œuvre d’abord : le visuel, le titre et l’avis personnel portent l’écran ; l’interface s’efface.
2. Un même rôle, une même apparence : boutons, champs, fenêtres, cartes et statuts se ressemblent partout.
3. Rapide à tenir à jour : noter, changer de statut, trier ou enregistrer une vue demande le moins de clics possible.
4. Local et durable : rien ne dépend d’un service distant pour consulter ou modifier la collection.
5. La mémoire avant les chiffres : dates, activité et critiques comptent plus que les statistiques.
