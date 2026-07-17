# Stabilisation V0.1 — design + contenu réel

Travaille dans ce workspace existant. Le prototype est une application personnelle desktop. Il ne faut ni le refondre ni étendre son périmètre produit.

## Contexte acquis

La direction retenue est **Archive calme** : interface claire, calme, dense mais respirante, sidebar desktop persistante, accent violet encre discret, titres expressifs Syne en majuscules et interface courante en sans-serif système.

Les deux explorations précédentes ont été supprimées. Cette V0.1 est désormais le seul socle de travail.

Le fichier `src/catalog.ts` vient d’être remplacé par un échantillon réel de huit films et huit séries ou animations japonaises, issu des trackers Notion personnels. Les affiches correspondantes sont maintenant dans `public/posters/`.

Lire aussi :
- `CONTENT_SNAPSHOT.md`
- `/Users/aurelientrouble/Documents/Hermes/bibliotheque-culturelle/06-systeme-visuel.md` si nécessaire

## Objectif

Stabiliser réellement le design et adapter l’interface aux données authentiques. Le rendu doit devenir une base robuste pour la future étape de création et d’édition locales.

## Non-négociables

1. **Aucune donnée fictive ne doit subsister dans l’interface.**
   - Ne pas réintroduire de durée, pays, années de diffusion, saisons, progression, texte personnel ou notes inventées.
   - Les dates, notes, résumés, créateurs et statuts doivent provenir de `catalog.ts`.
   - Ne pas convertir les notes Notion sur 10 en notes sur 5.
   - Les données absentes doivent être traitées élégamment, sans texte de remplissage prétendant connaître l’œuvre.

2. **Aucune fausse affiche CSS ne doit subsister.**
   - Supprimer les mécanismes `palette`, `mark`, cadres graphiques de couvertures et décorations qui remplaçaient des affiches.
   - Employer les affiches locales de `public/posters/` dans des éléments `<img>` avec un `alt` pertinent.
   - Ne jamais teinter, désaturer, recolorer, superposer un dégradé ou normaliser les affiches. Elles doivent garder leur identité propre.
   - Prévoir un fallback visuel neutre et typographique si une image manque, mais il ne doit pas être utilisé pour masquer une erreur de chemin sur les 16 éléments fournis.

3. **Rester dans la DA validée.**
   - Conserver le shell, la sidebar, l’espace et les contrôles souples de la V0 calme.
   - Conserver Syne locale, uniquement pour les titres de page, de section et de fiche, en capitales.
   - Navigation, filtres, métadonnées, titres de cartes et textes courants restent en sans-serif système.
   - Ne pas introduire de look SaaS, dashboard, verre, néon, métriques, capsules omniprésentes, ombres lourdes ou gradients décoratifs.
   - Les boutons et champs restent légèrement arrondis, jamais excessivement carrés ni en pilules.

4. **Ne pas ajouter de produits ou de flux hors périmètre.**
   - Pas de Tauri, SQLite, import Notion, API, authentification, dark mode, pages Livres/Jeux/Art, formulaire d’ajout fonctionnel, tri fonctionnel, ou mobile/PWA.
   - Les boutons Ajouter actuels sont non fonctionnels : les retirer du rendu plutôt que les faire passer pour une action disponible.
   - Retirer également le contrôle de tri non fonctionnel.

## Adaptations fonctionnelles exigées

### Accueil

- Remplacer le module récent par les éléments de `recentlyLived`, qui mélange Films et Séries selon leurs vraies dates.
- Chaque petite carte affiche un repère de médium et une date correcte.
- Le module secondaire doit s’appeler `À reprendre` et ouvrir `Severance`, réellement en `En pause`.
- Ne parler ni de saisons vues, ni de dernière saison, ni de notes personnelles. Utiliser uniquement le résumé et les métadonnées disponibles.
- Ne pas modifier arbitrairement la formulation actuelle du grand titre d’accueil : son micro-correctif de texte sera traité séparément.
- Remplacer le faux repère calendrier fixe par une formulation sobre et véridique, par exemple `ÉCHANTILLON PERSONNEL`.

### Films

- Afficher les huit films réels.
- La fiche ne montre que le réalisateur, l’année si présente, le statut, la note réelle sur 10, favori, date de visionnage si présente et résumé s’il existe.
- Le film `Bugonia` teste l’absence de métadonnées : le rendu doit rester propre, sans fabriquer de valeurs.

### Séries

- Afficher les huit séries réelles.
- Ajouter et rendre réellement fonctionnel le filtre `En pause`, à partir du statut fourni.
- La fiche ne montre que type, créateur, statut, note réelle sur 10, favori, date de fin si présente et résumé s’il existe.
- Aucun nombre de saisons, année de diffusion, pays ou progression ne doit apparaître, car ils ne sont pas dans cet échantillon réel.

## Stabilisation technique et documentaire

- Revoir `src/styles.css` pour supprimer le système de fausses couvertures et consolider les tokens CSS sémantiques.
- Utiliser une pile monospace système pour les petits libellés au lieu de référencer une police non chargée.
- Garder une focus-ring clavier visible et des contrastes corrects.
- Créer un `DESIGN.md` concis, versionné, qui formalise seulement ce qui est désormais validé : principes, tokens par rôle, règles typo, formes, posters, composants et anti-directions. Ne pas documenter d’hypothèses non validées.
- Mettre à jour le `README.md` pour décrire le prototype et préciser que l’échantillon actuel est local et réel, non synchronisé avec Notion.

## Vérification attendue

Exécuter les scripts existants de typecheck, verify et build. Ne pas committer. Dans ton message final, résume exactement les fichiers touchés, les contrôles exécutés et les éventuels compromis.
