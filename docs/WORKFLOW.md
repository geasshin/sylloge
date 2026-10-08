# Sylloge — mode de travail et gouvernance

## Objectif

Sylloge est développé par incréments vérifiables : une version contient un lot cohérent, limité et testable. Le but n’est pas de maximiser la vitesse de code, mais de préserver une application culturelle durable, locale, simple et soignée.

## Rôles

| Rôle | Responsabilité |
|---|---|
| Aurélien | Décide la vision, les arbitrages de périmètre, le feu vert d'implémentation et la validation d'usage. |
| Hermes | Orchestre **et** code : maintient les documents actifs, découpe les versions, implémente les lots dans le dépôt, vérifie les tests et explique les décisions. |
| Git | Historique fiable : une baseline, des commits lisibles et des tags de version. |

Depuis juillet 2026, Hermes code directement chaque lot dans Hermes Agent (modèle Kimi K3) : plus de délégation à un agent externe (Codex, Kimi CLI ou autre). Hermes conserve la même discipline qu'auparavant : brief borné avant chaque lot, contrôle du diff et des preuves après, rapport factuel à Aurélien avant le lot suivant. Une nouvelle idée est triée avant tout travail : elle rejoint le lot courant seulement si elle est nécessaire sans en modifier le contrat ; sinon elle est distribuée dans la prochaine version cohérente ou le backlog. Une direction ambiguë, coûteuse ou structurante exige un arbitrage d'Aurélien avant implémentation.

## Versionnement

Le projet utilise **Semantic Versioning** pour les versions réellement installables : `MAJEUR.MINEUR.CORRECTIF`. Depuis le 8 octobre 2026, chaque push sur `main` déclenche la publication automatique d’une version macOS avec le numéro correctif suivant, si le build et la signature réussissent.

- `0.5.0` : release historique qui a étendu la bibliothèque aux cinq médiums.
- `0.6.0` : version de base actuellement inscrite dans les manifestes source du projet.
- Les versions correctives publiées sont calculées automatiquement à partir de cette base et des tags stables existants.
- Les mentions `0.3.1`, `0.3.2`… désignent des jalons internes historiques, pas les versions que le workflow publie aujourd’hui.
- `1.0.0` : première version publique téléchargeable et assumée.
- `2.0.0` : futur chantier cloud / comptes / synchronisation / web app, distinct de la V1.
- `3.0.0` : éventuel chantier mobile natif, distinct de la V2.

Un jalon interne porte volontairement un libellé lisible pour suivre la progression du train. Il ne fixe pas la version installée : le workflow calcule celle-ci lors de chaque publication depuis `main`.

## Git sans jargon inutile

- Un **commit** est une photo nommée d’un état cohérent du projet.
- Une **branche** est une piste de travail isolée. `main` doit rester utilisable.

### Règle simple pour Sylloge

1. `main` contient le code validé. Chaque push sur cette branche lance le build macOS, crée le tag et la GitHub Release correspondants, puis publie l’archive signée et `latest.json`. Un build en échec ne publie pas de nouvelle release.
2. Une branche de travail peut contenir plusieurs commits et jalons internes. Elle ne publie rien tant qu’elle n’est pas intégrée à `main`.
3. Hermes relit chaque diff et lance les contrôles applicables ; Aurélien exerce la QA visible avant chaque commit de lot.
4. Une pull request n’est pas requise pour ce dépôt individuel. Un commit et un merge restent deux opérations distinctes : le commit fige la branche, le merge intègre son historique dans `main`.
5. Hermes demande explicitement l’accord avant la fusion de la release cible dans `main`.
6. Après le push sur `main`, GitHub Actions choisit le prochain numéro correctif à partir de la version de base et des tags stables existants. La version est appliquée aux manifestes uniquement dans le runner CI : aucun commit de version automatique n’est ajouté au dépôt.

Ce flux publie les mises à jour macOS. La première installation reste manuelle via le DMG. Ensuite, l’application peut proposer la version publiée et la personne choisit de la télécharger et de l’installer. La distribution Windows conserve son workflow distinct.

Pour les correctifs minuscules, une branche reste recommandée mais peut être évitée si Aurélien demande explicitement une intervention directe sur `main`.

## Boucle d’un lot

### 1. Pré-vol — gate bloquant

Avant de coder : lire `ROADMAP.md`, vérifier la branche, `git status`, le dernier tag, les documents concernés et les prérequis techniques. Un arbre inattendu, un test rouge ou une décision produit ambiguë bloque le départ.

Chaque lot de code est suivi d’un retour factuel à Aurélien — comportement livré, preuves automatisées et comportementales, limites — avant qu’un nouveau lot soit lancé.

### 2. Brief borné

Hermes prépare un prompt qui contient :

- jalon d’intégration et release cible, avec un objectif unique ;
- fichiers et références utiles ;
- critères d’acceptation observables ;
- tests à lancer ;
- exclusions explicites ;
- condition d’arrêt.

Un lot doit être cohérent sans viser « toute l’application » : typiquement une verticale ou un ensemble d’améliorations étroitement liées.

### 3. Implémentation

Hermes écrit le code dans la branche prévue. Le compte rendu d'implémentation n'est jamais considéré comme une preuve suffisante : seuls le diff relu et les contrôles exécutés font foi.

### 4. Revue — gate de révision

Hermes vérifie le diff, la conformité au brief, la qualité, les tests et, pour l’interface, le comportement réel dans l’application. Si un écart est relevé, il est corrigé puis revu à nouveau. Trois boucles sans convergence déclenchent une décision d’Aurélien.

### 5. Livraison d’un jalon — gate de validation humaine

Le jalon suivant ne démarre que si :

- les contrôles techniques applicables sont verts ;
- les scénarios utilisateur promis ont été exercés ;
- Aurélien a validé le rendu ou les compromis visibles ;
- le diff, les limites et les décisions reportées sont documentés.

Le lot n’est intégré à `main` qu’après validation des jalons concernés. Le push qui suit déclenche automatiquement le build et la publication macOS décrits plus haut.

## Maintenance documentaire

À la fermeture de chaque jalon, Hermes doit :

1. mettre à jour le statut et les décisions dans `ROADMAP.md` ;
2. corriger le README ou les documents techniques touchés ;
3. archiver ce qui n’est plus normatif au lieu de le laisser se faire passer pour une règle active ;
4. noter les limites réelles et les décisions repoussées ;
5. créer le ou les commits seulement après vérification.

La version de base et les manifestes source restent cohérents dans le dépôt. La publication automatique leur applique un numéro correctif dans le runner CI, sans modifier le dépôt distant.

Un document ne doit pas répéter une autre source de vérité : le code décrit le comportement exact, les tests prouvent des invariants, et les documents expliquent le périmètre, la décision et l’ordre de construction.
