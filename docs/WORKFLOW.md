# Sylloge — mode de travail et gouvernance

## Objectif

Sylloge est développé par incréments vérifiables : une version contient un lot cohérent, limité et testable. Le but n’est pas de maximiser la vitesse de code, mais de préserver une application culturelle durable, locale, simple et soignée.

## Rôles

| Rôle | Responsabilité |
|---|---|
| Aurélien | Décide la vision, les arbitrages de périmètre, le feu vert d’implémentation et la validation d’usage. |
| Hermes | Mémoire de l’orchestration : maintient les documents actifs, découpe les versions, prépare les briefs Codex, contrôle les diffs, vérifie les tests et explique les décisions. |
| Codex | Exécute un lot de code borné dans le dépôt, avec critères d’acceptation et rapport exact. Il ne décide pas seul du produit ni de l’architecture future. |
| Git | Historique fiable : une baseline, des commits lisibles et des tags de version. |

Hermes peut aussi modifier directement du code lorsque le changement est très local, bien compris et facile à vérifier. Pour une fonctionnalité transversale ou une refonte, Codex reste le lane d’implémentation privilégié ; Hermes conserve la maîtrise du périmètre et de la vérification.

## Versionnement

Le projet utilise **Semantic Versioning** : `MAJEUR.MINEUR.CORRECTIF`.

- `0.1.0` : baseline actuelle.
- `0.1.1`, `0.1.2` : corrections et petits lots compatibles après la baseline.
- `0.2.0`, `0.3.0`… : jalons fonctionnels importants.
- `1.0.0` : première version publique téléchargeable et assumée.
- `2.0.0` : futur chantier cloud / comptes / synchronisation / web app, distinct de la V1.
- `3.0.0` : éventuel chantier mobile natif, distinct de la V2.

Le libellé oral « 0.11 » est ambigu : dans un outil technique, il signifie généralement `0.11.0`, pas le correctif suivant de `0.1.0`. Les tags et le manifeste utilisent donc `0.1.1`, puis `0.1.2`.

## Git sans jargon inutile

- Un **commit** est une photo nommée d’un état cohérent du projet.
- Une **branche** est une piste de travail isolée. `main` doit rester utilisable.

### Règle simple pour Sylloge

1. `main` contient uniquement une version vérifiée, taguée et poussée.
2. Un lot de code non trivial part dans une branche courte, par exemple `release/0.1.1-stabilisation`.
3. Hermes relit le diff et lance les contrôles.
4. Aurélien valide le résultat d’usage.
5. Hermes demande explicitement l’accord avant fusion dans `main`.
6. Une fois fusionné : tag de version et mise à jour des documents. Un dépôt distant ne sera configuré ou alimenté que sur demande d’Aurélien.

Pour les correctifs minuscules, une branche reste recommandée mais peut être évitée si Aurélien demande explicitement une intervention directe sur `main`.

## Boucle d’un lot

### 1. Pré-vol — gate bloquant

Avant de coder : lire `ROADMAP.md`, vérifier la branche, `git status`, le dernier tag, les documents concernés et les prérequis techniques. Un arbre inattendu, un test rouge ou une décision produit ambiguë bloque le départ.

### 2. Brief borné

Hermes prépare un prompt qui contient :

- version et objectif unique ;
- fichiers et références utiles ;
- critères d’acceptation observables ;
- tests à lancer ;
- exclusions explicites ;
- condition d’arrêt.

Un lot doit être cohérent sans viser « toute l’application » : typiquement une verticale ou un ensemble d’améliorations étroitement liées.

### 3. Implémentation

Codex écrit le code dans la branche prévue. Hermes ne considère jamais son compte rendu comme une preuve suffisante.

### 4. Revue — gate de révision

Hermes vérifie le diff, la conformité au brief, la qualité, les tests et, pour l’interface, le comportement réel dans l’application. Si un écart est relevé, il est corrigé puis revu à nouveau. Trois boucles sans convergence déclenchent une décision d’Aurélien.

### 5. Livraison — gate de validation humaine

La version n’est fusionnée que si :

- les contrôles techniques applicables sont verts ;
- les scénarios utilisateur promis ont été exercés ;
- Aurélien a validé le rendu ou les compromis visibles ;
- la documentation et la version du manifeste sont à jour.

## Maintenance documentaire

À la fermeture de chaque lot, Hermes doit :

1. mettre à jour la version, le statut et les décisions dans `ROADMAP.md` ;
2. corriger le README ou les documents techniques touchés ;
3. archiver ce qui n’est plus normatif au lieu de le laisser se faire passer pour une règle active ;
4. noter les limites réelles et les décisions repoussées ;
5. créer le commit et le tag seulement après vérification.

Un document ne doit pas répéter une autre source de vérité : le code décrit le comportement exact, les tests prouvent des invariants, et les documents expliquent le périmètre, la décision et l’ordre de construction.
