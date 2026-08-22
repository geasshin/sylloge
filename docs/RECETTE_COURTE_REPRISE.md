# Sylloge — recette courte de remise en état

> **Quand :** avant l'ouverture du jalon `0.5.1` du train `0.6.0`. Referme l'incertitude laissée par la recette `0.5.0` interrompue le 22 juillet 2026 (première passe exercée, jamais rejouée après la stabilisation).
>
> **Durée estimée :** 20 à 30 minutes. **Règle absolue :** sur un profil de test créé pour l'occasion, jamais sur ta bibliothèque réelle.
>
> Gravités P0 à P3 : mêmes définitions que [`QA_MANUELLE_0.5.0.md`](QA_MANUELLE_0.5.0.md).

## 0. Préparation sûre

- [ ] Fermer toute autre instance de Sylloge (application installée comprise).
- [ ] Depuis le dépôt : `npm install && npm run tauri:dev`.
- [ ] Dans l'application, créer un profil nommé « Test recette ». Ne rien toucher aux profils existants.

## 1. Démarrage et accès

- [ ] L'application démarre sans erreur et affiche l'accueil.
- [ ] Paramètres → À propos : la version affichée correspond au build (`0.5.0`).
- [ ] Les cinq entrées Films, Séries, Livres, Jeux et Art s'ouvrent toutes depuis la sidebar.

## 2. Cycle complet sur chaque médium

Pour chacun des cinq médiums, avec un item de test évidemment reconnaissable (« Test Recette … ») :

- [ ] Créer une fiche manuelle minimale et la voir apparaître dans la bibliothèque.
- [ ] Modifier un champ, fermer, rouvrir la fiche : la modification est conservée.
- [ ] Supprimer la fiche avec sa confirmation explicite.

Détails utiles par médium : Livre en Manga pour voir le compteur de tomes +/− ; Jeu avec une plateforme saisie libre ; œuvre d'Art qui n'offre aucune note.

## 3. Création assistée (réseau)

- [ ] Films : rechercher « Amélie » dans TMDB, cliquer un résultat : le formulaire se préremplit, statut/note/favori restent vides, puis annuler sans rien écrire.
- [ ] Séries : même parcours TMDB TV avec un titre connu.
- [ ] Livres : même parcours Open Library avec « Le Petit Prince ».
- [ ] Jeux : même parcours RAWG, attribution « Données : RAWG » visible.

Si un fournisseur échoue : noter le message exact affiché avant tout diagnostic, une panne chez le fournisseur n'est pas un défaut de l'application.

## 4. Données et sauvegardes

- [ ] Exporter la collection Films en JSON : le fichier existe et n'est pas vide.
- [ ] Réimporter ce fichier dans Films : aperçu correct, choisir Remplacer, la collection revient identique.
- [ ] Paramètres : exporter la Sauvegarde Sylloge complète.
- [ ] Modifier une fiche après avoir choisi un dossier de snapshots : un snapshot apparaît dans ce dossier.

## 5. Clôture

- [ ] Supprimer le profil « Test recette » (confirmation explicite), l'application retombe proprement sur un profil restant ou l'onboarding.
- [ ] Journal des anomalies relevées (identifiant, gravité, description) :

| ID | Gravité | Description |
|---|---|---|

**Verdict à reporter dans `ROADMAP.md` §`0.5.0` :**

- [ ] Recette courte exercée le ____________ sans anomalie P0 ni P1.
- [ ] Anomalies P2/P3 notées et reportées : ____________
