# Plan de remise à plat de Sylloge

**Statut :** remise à plat documentaire terminée le 6 octobre 2026. Le lot 1 a ensuite été implémenté dans le même checkout ; son état courant est décrit dans la feuille de route et son compte rendu.

## Point de départ

- Base retenue : main au commit 0854e2a.
- L’application installée est considérée comme représentant la même étape générale que main, mais son commit exact demeure inconnu.
- Les branches distantes experiment/sylloge-mobile et release/0.6.0-design-desktop ont été supprimées le 6 octobre 2026 à la demande d’Aurélien. Aucun code propre à ces branches n’a été perdu.
- La remise à plat ne réinitialise pas l’application installée ni les données SQLite personnelles.

## Décisions recueillies

- Usage personnel local sur Mac.
- Les cinq bibliothèques restent : Films, Séries, Livres, Jeux et Art.
- L’allure visuelle actuelle est conservée comme base.
- Les problèmes prioritaires sont le désordre ressenti, les bugs, les imports JSON/CSV de Films et Séries, les compositions irrégulières et le manque de finition.

## Étapes

### 1. Établir l’état de référence

**Terminé.** Capacités, fournisseurs, versions, documents et contrôles de départ sont consignés dans [l’état de base](ETAT_DE_BASE.md). L’absence des secrets locaux requis sur un clone propre et l’impossibilité de piloter la fenêtre native sont documentées.

### 2. Fermer les décisions produit et classer l’historique

**Terminé.** Les choix de cible, de bibliothèques, de base visuelle et du premier domaine à travailler ont été recueillis. Les anciennes roadmaps, le contrat visuel précédent, le README et le mode de travail sont archivés. Les anciens briefs restent accessibles dans plans/ et sont marqués comme historiques. Le brief du lot 1 est maintenant le compte rendu d’un lot livré. Aucun nouveau lot n’est actif.

### 3. Réécrire les références actives

**Terminé.** README.md, AGENTS.md, DESIGN.md, docs/README.md, docs/WORKFLOW.md et docs/ROADMAP.md sont réalignés sur le code et les choix confirmés. La nouvelle roadmap ne reprend aucun ancien jalon comme tâche active.

### 4. Préparer le premier lot

**Terminé.** Le brief préparé pour le premier lot ciblait les imports de fichiers Films et Séries et demandait des vérifications sur fichiers factices, sans toucher à la bibliothèque personnelle. Son exécution et ses limites sont consignées dans le compte rendu du lot.

### 5. Vérifier la remise à plat documentaire

**Terminé le 6 octobre 2026.** À la clôture de l’étape documentaire, les liens locaux, la cohérence des références, la syntaxe des outils touchés et le typecheck étaient vérifiés. Cette étape n’a pas modifié le comportement fonctionnel. Les changements fonctionnels ajoutés ensuite appartiennent au lot 1.

## Critères de clôture

- Les références actives décrivent la même base, le même public cible, les mêmes cinq bibliothèques et la même direction visuelle.
- Aucun ancien jalon ou point « à faire » ne se présente comme un engagement actuel.
- Le premier brief d’évolution est ciblé et vérifiable.
- Les fichiers et données personnelles restent hors des essais.
- Les contrôles documentaires sont propres et les limites techniques sont rapportées.
