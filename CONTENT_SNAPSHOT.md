# Échantillon de contenu réel — V0.1

> Snapshot de travail local réalisé le 17 juillet 2026 depuis les bases personnelles Notion `Movies_DB` et `Shows_DB`.

## Périmètre

La V0.1 utilise désormais uniquement un échantillon réel : huit films et huit séries ou animations japonaises. Il ne s’agit ni d’un import complet ni d’une synchronisation Notion.

Les données mises en interface sont limitées aux propriétés réellement présentes : titre, statut, note, favori, date de visionnage ou de fin lorsqu’elle existe, réalisateur ou showrunner, type de série, résumé et affiche.

## Règles de fidélité

- Les statuts Notion sont traduits sans les enrichir : `To Watch` devient `À découvrir`, `Watched` devient `Terminé` ou `Terminée`, `On Hold` devient `En pause`.
- Les notes restent sur l’échelle réellement utilisée dans Notion, sur 10. Aucune conversion vers une note sur 5 n’est appliquée.
- Les champs absents restent absents. Le prototype ne déduit pas une durée, un pays, des saisons, une année ou une note personnelle.
- Les affiches proviennent des URL déjà associées aux fiches Notion. Elles sont téléchargées localement uniquement pour ce prototype personnel. Leur provenance devra être réétudiée avant toute distribution publique.

## Limites assumées

Les résumés sont des descriptions déjà présentes dans Notion, pas des notes personnelles. La prochaine étape de produit consiste bien à créer le flux d’ajout et d’édition local, afin de pouvoir conserver des textes personnels sans dépendre de Notion.
