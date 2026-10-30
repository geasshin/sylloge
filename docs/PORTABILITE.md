# Portabilité d’un profil

## Ce que l’application sauvegarde

Un seul fichier JSON par profil, `sylloge-library`, version **8** depuis le 30 octobre 2026.
Les versions 1 à 7 restent lisibles : un document plus ancien s’importe, sans expérience
(avant la v5), sans champs de forme d’art (avant la v6), sans bannière (avant la v7) et sans
années de diffusion (avant la v8).

| Contenu | Porté depuis |
| --- | --- |
| Profil (nom, avatar), sept bibliothèques de base, bibliothèques personnalisées, notes, avis, notes personnelles, dates, citations | v1 pour les films, v3 pour les sept sections, v4 pour les bibliothèques personnalisées |
| Vues enregistrées (nom, bibliothèque, filtres et tri) | **v5** |
| Préférences d’affichage : thème, langue, lecture automatique de l’accueil, barre latérale épinglée | **v5** |
| Recettes de cuisine (`customLibraries`, identifiant `recipes`) : ingrédients et étapes en textes longs conservés ligne pour ligne, photo en lien | v5, ajoutées le 23 octobre 2026 |
| Champs propres à chaque forme d’art (`details` d’une œuvre) : texte d’un poème vers pour vers, recueil, traduction, technique, dimensions, matériau, tirage… | **v6**, 27 octobre 2026 |
| Bannière 16:9 des films, séries, animés et jeux (`bannerUrl`) : l’adresse d’une image paysage, `null` quand aucune n’est choisie | **v7**, 30 octobre 2026 |
| Période de diffusion des séries et animés (`firstAirYear`, `lastAirYear`) : deux années, `null` quand elles ne sont pas connues | **v8**, 30 octobre 2026 |

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
| Identifiant d’installation (`installation.id`, hors base) | Il désigne un appareil, pas une personne : recopié ailleurs, deux machines compteraient pour une. Il se recrée au premier lancement et sert au relais à répartir la charge. |

Les couvertures et photos sont des **adresses**, jamais des fichiers : la sauvegarde ne contient aucune image ([COUVERTURES.md](COUVERTURES.md)). Une sauvegarde qui contient des recettes n’est pas lisible par une version de l’application antérieure au 23 octobre 2026 (bibliothèque inconnue) ; le format reste en v5.

Champs de forme d’art (v6) : chaque œuvre porte `details`, un objet « clé → texte » (`{}` quand
rien n’est saisi), stocké dans la colonne JSON `artworks.details` (migration 0025). Une œuvre
v1 à v5 n’a pas cette clé et s’importe avec un objet vide ; une œuvre v6 sans elle est refusée.
Une sauvegarde v7 n’est pas lisible par une version antérieure au 30 octobre 2026, qui
l’annonce comme venant d’une version plus récente. Le CSV v1 de l’Art ne porte ni les champs
personnalisés ni les champs de forme : seul le JSON les fait voyager. À l’import avec fusion,
un détail déjà saisi n’est jamais remplacé, un détail absent est comblé.

Période de diffusion (v8) : séries et animés portent `firstAirYear` et `lastAirYear`
(colonnes `first_air_year` / `last_air_year`, migration 0027). Un document v1 à v7 les
importe à `null` ; une fusion qui ne les porte pas ne les efface jamais. Une sauvegarde v8
n’est pas lisible par une version antérieure à la 0.6.21.

Un document v5 écrit par un chemin qui ne collecte rien (export d’une seule collection)
porte `"experience": { "version": 1, "savedViews": [], "preferences": {} }` : cela se lit
« ce document ne porte aucune expérience », jamais « préférences perdues ».


## Bannière 16:9 (v7)

Chaque film, série, animé et jeu porte `bannerUrl` : l’adresse d’une image paysage,
`null` quand aucune n’est choisie (il n’existe pas de bannière par défaut). La colonne
`banner_url` correspondante est ajoutée par la migration 0026 sur `films`, `series`,
`anime` et `games` — un ajout pur, sans réécriture de ligne. Les livres, les mangas,
l’Art et les bibliothèques personnalisées n’en ont pas.

- Une bannière est toujours une adresse `https://` d’au plus 2 048 caractères : un
  fichier local (`file:`), une image inline (`data:`) ou une adresse `http://` sont
  refusés à l’écriture comme à l’import. C’est une image d’adresse, jamais un fichier :
  la sauvegarde n’embarque aucune image.
- Une fiche d’un document v1 à v6 n’a pas la clé : elle s’importe avec `bannerUrl: null`.
  Une fiche v7 sans la clé est refusée, comme les détails d’une œuvre en v6.
- Un import **avec fusion** qui ne porte pas de bannière ne l’efface jamais : la valeur
  déjà enregistrée est conservée (l’écriture SQL fait `COALESCE`). Un import qui en
  porte une la remplace.
- **Le CSV ne porte pas la bannière**, et le format JSON Films v1 non plus (il est figé
  en juillet 2026) : seule la sauvegarde JSON complète du profil la fait voyager. Un
  export de collection puis sa réimportation laissent donc la bannière de côté, ce qui
  est dit ici plutôt que découvert après coup.

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
5. **Chaque chemin de restauration applique l’expérience** : l’import en profil neuf
   (`importLibraryDocument`) comme l’import en profil vide (`importLibraryDocumentIntoEmptyProfile`,
   utilisé par le premier lancement et par la fenêtre « Restaurer »). Ce deuxième chemin
   l’oubliait dans la v0.6.11 : les vues et préférences d’un document v5 n’étaient pas
   restaurées par le parcours principal. Corrigé en v0.6.12 ; test de régression dans
   `scripts/profile-experience.test.mjs`, et recette navigateur `scripts/qa-backup-page.js`.

## Ce que l’écran dit

- Le bouton **Exporter** d’une bibliothèque ouvre une fenêtre en deux groupes : « Sauvegarde
  complète » (JSON Sylloge, CSV) et « Exporter vers un service » (fichiers au format d’import de
  Letterboxd, SensCritique, Simkl, The StoryGraph, Hardcover selon la bibliothèque). Un fichier de
  service ne contient qu’un médium ; l’option disparaît pour « Tout le profil ». Détail des formats
  et de leurs limites : [EXPORTS_SERVICES.md](EXPORTS_SERVICES.md).
- **Avant** la restauration, l’aperçu annonce ce que le document emporte (« Elle contient aussi
  2 vues enregistrées et 2 préférences d’affichage »), ou dit qu’un document v4 ou vide n’en
  contient pas. L’ancienne phrase « les réglages et vues ne font pas partie de ce format » était
  devenue fausse avec la v5.
- **Après** la restauration, une phrase de bilan : vues restaurées, renommées (nom déjà pris),
  ignorées, préférences appliquées. Rien n’est affiché quand il n’y a rien à dire ; un échec de
  cette étape est dit sans prétendre que les fiches n’ont pas été restaurées. Le dépôt garde le
  bilan jusqu’à ce que l’écran le lise (`takeExperienceOutcome`), une seule fois.
- Une sauvegarde d’une **version plus récente** que celle comprise (entier au-delà de la version
  courante) est refusée avec « Cette sauvegarde a été créée par une version plus récente de
  Sylloge. Mettre l’application à jour pour la restaurer. » Une version absurde (0, négative,
  décimale, texte) garde le message général. Ce message n’existe que dans les versions qui le
  contiennent : une v0.6.10 ou v0.6.11 affichera encore « Les versions 1 à 4/5 du document sont
  prises en charge ».

## Vérifications

- `npm run test:portability` : aller-retour des sept bibliothèques et des champs personnels,
  v1 à v7, bannière v7 et période v8 comprises (document v6 relu avec `bannerUrl: null`,
  bannière non https refusée, clé de bannière refusée dans un document v6, document v7 relu
  sans années, années hors 1900–2100 ou fin avant début refusées), et `scripts/profile-experience.test.mjs`
  pour l’expérience (document v5, document v4 sans experience, préférence abîmée écartée sans
  perte, conflit de nom, restauration dans un profil vide, texte du bilan et de l’aperçu,
  version future).
- `npm run test:banners` : le tri et le filtrage des candidats de bannière (paysage, 16:10 à
  2:1, largeur minimale, sans texte d’abord puis la langue, 24 au plus, adresse https bornée).
- `npm run verify` : contrats de données, migrations et sérialisation.
- Ce qui n’est pas couvert : le parcours de restauration complet dans l’interface native
  (dialogue de fichier macOS ou Windows, écriture réelle du fichier de sauvegarde). Le
  harnais `qa-app.html` reconstruit sa base en mémoire à chaque chargement.
