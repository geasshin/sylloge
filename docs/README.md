# Documentation de Sylloge

## Documents actifs

1. [Feuille de route](ROADMAP.md) : périmètre confirmé, état du lot livré et suite à définir.
2. [État de base](ETAT_DE_BASE.md) : faits vérifiés, décisions de reprise et limites.
3. [Plan de remise à plat](PLAN_REMISE_A_PLAT.md) : étapes accomplies et critères de clôture.
4. [Mode de travail](WORKFLOW.md) et [base visuelle](../DESIGN.md) : règles courantes.
   [Langues de l’interface](I18N.md) : détection, choix, écriture des textes et contrôles.
   [Mises à jour](UPDATER.md) : annonce dans l’application, manifeste `latest.json`, chaîne de release macOS et Windows.
   [Portabilité](PORTABILITE.md) : ce qu’une sauvegarde porte (document v5), ce qui reste sur la machine, restauration.
   [Couvertures](COUVERTURES.md) : visuels par lien dans toutes les bibliothèques, règle d’affichage des films, défauts corrigés.
5. [Compte rendu du lot 1](plans/brief-imports-films-series.md) : changements livrés et vérifications factices.
6. [Contrats de données](CONTRAT_CSV_FILMS_V1.md), [collections CSV](CONTRAT_CSV_COLLECTIONS_V1.md), [conteneurs d’import](CONTRAT_CONTENEURS_IMPORT_V1.md) et [compatibilité Films](CONTRAT_FILMS_V1.md) : références à vérifier avant de modifier les formats.

## Historique

- archive/ contient les anciennes versions de README, feuille de route, design et mode de travail.
- plans/ contient le compte rendu du lot 1 et les anciens briefs. [Son index](plans/README.md) distingue les résultats actuels de l’historique.
- qa/, validation/ et releases/ contiennent des preuves datées. Elles ne prouvent pas le comportement du code actuel sans nouvelle vérification.
- [Configuration historique de l’updater](TAURI_UPDATER_SETUP.md) et anciens documents de release : consulter seulement si un besoin local le justifie.

## Source de vérité

Le code actuel de la branche main au commit 0854e2a est la base de reprise convenue. La release taguée et l’application installée sont des états distincts. Les détails sont consignés dans [l’état de base](ETAT_DE_BASE.md).
