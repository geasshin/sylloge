# Sylloge — instructions pour les agents de code

Sylloge est une bibliothèque culturelle personnelle **local-first**. La dernière release publique est `0.4.0` ; le train actif prépare `0.5.0`, l’extension culturelle aux cinq médiums définis dans la roadmap.

## Références à lire avant toute modification

Dans cet ordre :

1. `docs/ROADMAP.md` — périmètre, invariants et exclusions de la version ;
2. `docs/WORKFLOW.md` — rôles, gates et règles Git ;
3. `README.md` — architecture, lancement, données et sauvegarde ;
4. `DESIGN.md` — règles visuelles et accessibilité.

Le code et ses tests décrivent le comportement précis. Ne traite pas les prototypes, prompts ou notes hors du dépôt comme une spécification active.

## Pré-vol et commandes

Avant d’éditer : relève `git status --short --branch`, lis les documents ci-dessus et vérifie le périmètre du brief. Arrête-toi et rapporte le blocage avant toute modification si l’arbre contient des changements inattendus, si une décision produit manque, ou si la baseline échoue à ses contrôles applicables.

Contrôles usuels :

```bash
npm run typecheck
npm run verify
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test && cargo clippy --all-targets -- -D warnings
```

Un test peut naturellement être rouge durant un cycle de développement ciblé ; le contrôle de départ et le contrôle final doivent être verts. Ne masque jamais un échec en supprimant ou désactivant un test.

## Garde-fous de périmètre

N’ajoute pas de ta propre initiative : nouveau médium, redesign global, source externe ou API, compte, cloud, synchronisation, backend, tracking, dépendance, permission Tauri, format de données, migration SQLite ou changement de version. Si cela devient nécessaire pour le brief, explique pourquoi et attends un arbitrage.

Pour un lot non trivial, travaille dans la branche prévue par le brief. Ne commit, ne fusionne, ne tague et ne pousse rien sauf instruction explicite.

## Données, import et affiches

- SQLite locale est la source de vérité. Ne synchronise jamais le fichier SQLite actif, son WAL ou son SHM avec un service cloud.
- Préserve les migrations séquentielles de `src-tauri/src/database.rs` et teste toute évolution de schéma ou d’accès SQLite.
- Un import est validé avant toute écriture, atomique, et crée un nouveau profil : il n’écrase ni ne fusionne silencieusement un profil existant.
- Les exports JSON restent lisibles et versionnés. N’invente ni données ni contenu de remplacement.
- Une affiche est facultative. Garde l’alternative accessible et le fallback neutre quand son URL est absente ou échoue ; aucun filtre, teinte, dégradé ou recadrage destructeur.

## Rapport de fin de lot

Réponds de façon factuelle avec :

1. les fichiers réellement modifiés et le comportement livré ;
2. les commandes lancées et leur résultat exact ;
3. les scénarios manuels restant à exercer ;
4. les limites, écarts ou décisions à arbitrer.

Si un garde-fou bloque, ne contourne pas le problème : arrête-toi, conserve le périmètre et rapporte le fait précis.
