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

Le projet utilise **Semantic Versioning** pour les versions réellement installables : `MAJEUR.MINEUR.CORRECTIF`.

- `0.5.0` : dernière release publique macOS signée (extension culturelle aux cinq médiums).
- `0.4.0`, `0.5.0`… : releases publiques qui regroupent plusieurs fonctionnalités cohérentes et validées.
- `0.3.1`, `0.3.2`… sont des **jalons d’intégration internes** du train qui prépare `0.4.0` : ils ne deviennent ni un tag, ni une version de manifeste, ni une GitHub Release. Le même repérage décale ensuite d’un train : `0.4.1…` prépare `0.5.0`.
- `1.0.0` : première version publique téléchargeable et assumée.
- `2.0.0` : futur chantier cloud / comptes / synchronisation / web app, distinct de la V1.
- `3.0.0` : éventuel chantier mobile natif, distinct de la V2.

Un jalon interne porte volontairement un libellé lisible pour suivre la progression du train ; il ne doit pas être confondu avec une patch release SemVer. Si une correction doit réellement être distribuée seule, elle devient une vraie `0.3.1` : son statut public exige alors manifeste, tag, artefacts signés et GitHub Release.

## Git sans jargon inutile

- Un **commit** est une photo nommée d’un état cohérent du projet.
- Une **branche** est une piste de travail isolée. `main` doit rester utilisable.

### Règle simple pour Sylloge

1. `main` contient uniquement les **releases publiées** : `0.2.0`, `0.3.0`, `0.4.0`…, vérifiées, taguées et poussées.
2. Une branche de train, par exemple `release/0.4.0-import-export-metadonnees`, peut contenir plusieurs jalons internes (`0.3.1…0.3.5`) et commits cohérents avant sa fusion ; aucun jalon interne n’est une release publique.
3. Hermes relit chaque diff et lance les contrôles applicables ; Aurélien exerce la QA visible avant chaque commit de lot.
4. Une pull request n’est pas requise pour ce dépôt individuel. Un commit et un merge restent deux opérations distinctes : le commit fige la branche, le merge intègre son historique dans `main`.
5. Hermes demande explicitement l’accord avant la fusion de la release cible dans `main`.
6. Une fois fusionné : mettre à jour les manifestes et documents, créer le tag de version, puis **proposer** le push de `main` et du tag vers GitHub. Un merge local ne pousse jamais automatiquement quoi que ce soit.

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

La release cible n’est fusionnée dans `main`, versionnée, taguée et proposée à la publication qu’après validation de tous ses jalons internes.

## Maintenance documentaire

À la fermeture de chaque jalon, Hermes doit :

1. mettre à jour le statut et les décisions dans `ROADMAP.md` ;
2. corriger le README ou les documents techniques touchés ;
3. archiver ce qui n’est plus normatif au lieu de le laisser se faire passer pour une règle active ;
4. noter les limites réelles et les décisions repoussées ;
5. créer le ou les commits seulement après vérification.

À la fermeture d’une release publique, Hermes met aussi à jour les manifestes et la version, crée le tag après vérification et propose explicitement le push puis la GitHub Release.

Un document ne doit pas répéter une autre source de vérité : le code décrit le comportement exact, les tests prouvent des invariants, et les documents expliquent le périmètre, la décision et l’ordre de construction.
