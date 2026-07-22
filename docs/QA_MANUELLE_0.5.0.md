# Sylloge — recette manuelle complète du train 0.5.0

> Objectif : éprouver l’application native, la logique produit et l’intégrité des données avant la release publique `0.5.0`. Ce document ne cherche pas à valider la direction artistique finale du train `0.6.0`.

> **État au 22 juillet 2026 : recette interrompue après la première passe.** Les retours ont ouvert les jalons de stabilisation `0.4.10+` décrits dans [`plans/0.5.0-stabilisation-post-qa.md`](plans/0.5.0-stabilisation-post-qa.md). Cette checklist est mise à jour progressivement ; les jalons `0.4.14` et `0.4.15` ajoutent ici les contrôles de cohérence Importer/Exporter et les exports CSV des cinq médiums.

## Comment utiliser cette recette

- Cocher une case seulement quand le résultat observé correspond au résultat attendu.
- Pour chaque anomalie, noter immédiatement un identifiant dans le journal en fin de document.
- Ne pas interrompre toute la recette pour une gêne mineure : la noter, continuer, puis regrouper les corrections.
- Arrêter en revanche immédiatement en cas de perte, mélange, duplication massive ou écrasement silencieux de données.

### Gravité proposée

- **P0 — intégrité** : perte ou mélange de données, import partiel, corruption, suppression non consentie.
- **P1 — parcours bloqué** : création, modification, recherche, import, export ou changement de profil inutilisable.
- **P2 — comportement incorrect** : résultat faux mais contournable, compteur ou filtre incohérent, message trompeur.
- **P3 — friction** : libellé, ordre, composition ou interaction compréhensible mais maladroite.
- **Observation produit** : ce n’est pas nécessairement un bug ; la logique ou l’emplacement d’une action semble discutable.

---

# 0. Préparation sûre

## 0.1 Protéger les données existantes

- [ ] Fermer toute autre instance de Sylloge avant de lancer la version de développement.
- [ ] Si une bibliothèque personnelle réelle existe, l’exporter d’abord avec **Paramètres → Importer et exporter → Exporter JSON**.
- [ ] Vérifier que le fichier JSON d’export existe réellement et n’est pas vide.
- [ ] Ne jamais copier `sylloge.db`, `sylloge.db-wal` ou `sylloge.db-shm` pendant que Sylloge est ouvert.
- [ ] Pour une sauvegarde brute facultative, fermer Sylloge puis copier le dossier complet `~/Library/Application Support/com.aurelientrouble.sylloge/`.
- [ ] Faire les essais destructifs dans des profils de test, jamais dans le profil personnel principal.

## 0.2 Lancer la bonne version

- [ ] Depuis la racine du dépôt, lancer `npm run tauri:dev`.
- [ ] Vérifier que l’application démarre sans écran blanc, crash ou message d’erreur système.
- [ ] Vérifier qu’une seule fenêtre Sylloge est active.
- [ ] Noter l’heure de début de la recette et la branche testée.

## 0.3 Préparer les profils de recette

Créer au maximum trois profils pour garder de la marge sous la limite de cinq :

- [ ] `QA Principal` — bibliothèque mixte utilisée pour le CRUD et les exports.
- [ ] `QA Import` — bibliothèque utilisée pour les fusions et remplacements.
- [ ] `QA Vide` — profil strictement vide réservé à la restauration globale.
- [ ] Vérifier que le profil actif est toujours identifiable avant une action d’import, d’export ou de suppression.

## 0.4 Jeu de données conseillé

Dans `QA Principal`, prévoir au moins deux fiches par médium :

1. une fiche **minimale**, avec seulement le titre ;
2. une fiche **complète**, avec accents, apostrophe, tiret long, caractères non latins, texte multiligne, favori, date et image facultative.

Exemple de chaîne de résistance : `Été à Tōkyō — l’œuvre d’Anaïs 🎬`.

- [ ] Utiliser au moins une note personnelle de plusieurs paragraphes.
- [ ] Utiliser au moins une URL d’image valide connue.
- [ ] Utiliser au moins une URL d’image HTTP(S) syntaxiquement valide mais inaccessible, par exemple sur le domaine réservé `example.invalid`.
- [ ] Laisser volontairement plusieurs champs facultatifs vides.
- [ ] Créer au moins deux catégories/formes/plateformes différentes pour exercer les filtres.

---

# 1. Démarrage, navigation et persistance générale

- [ ] L’application retrouve le dernier profil ou affiche un état initial compréhensible.
- [ ] Les cinq entrées **Films, Séries, Livres, Jeux et Art** sont présentes dans la navigation.
- [ ] Chaque entrée ouvre la bonne bibliothèque et le bon titre de page.
- [ ] Les compteurs de la navigation correspondent au nombre de fiches du profil actif.
- [ ] Passer rapidement d’un médium à l’autre ne mélange pas les fiches ni les compteurs.
- [ ] Ouvrir une fiche puis revenir à la collection ramène dans le bon médium.
- [ ] Annuler un formulaire ne crée ni ne modifie aucune fiche.
- [ ] Après plusieurs créations et modifications, fermer complètement l’application puis la relancer.
- [ ] Toutes les fiches, notes, favoris, dates, statuts, images et progressions sont toujours présentes.
- [ ] Le profil actif et les compteurs restent cohérents après relance.
- [ ] Aucun chargement ne reste bloqué indéfiniment sur « Lecture » ou « Recherche ».

### Observation d’expérience

- [ ] À tout moment, il est clair **dans quel profil** et **dans quel médium** on agit.
- [ ] Les actions principales ne donnent pas l’impression d’agir globalement quand elles ne concernent qu’un médium.
- [ ] Les retours, annulations et confirmations ne créent pas de cul-de-sac.

---

# 2. Profils et isolation des bibliothèques

## 2.1 Créer, ouvrir et renommer

- [ ] Créer `QA Principal`, `QA Import` et `QA Vide` depuis Paramètres → Profils.
- [ ] Un nom vide ou constitué d’espaces ne peut pas être enregistré.
- [ ] Renommer un profil et vérifier le nouveau nom dans la liste, la sidebar et après relance.
- [ ] Annuler un renommage conserve l’ancien nom.
- [ ] Ouvrir successivement les trois profils fonctionne sans rechargement incohérent.
- [ ] Chaque ligne de profil résume correctement les cinq collections qu’elle contient.

## 2.2 Isolation SQLite par profil

- [ ] Créer une fiche dans `QA Principal` puis ouvrir `QA Import` : la fiche ne doit pas apparaître.
- [ ] Créer une fiche portant le même titre dans les deux profils : les fiches restent indépendantes.
- [ ] Modifier ou supprimer la fiche dans un profil : l’autre profil reste intact.
- [ ] Les recherches et filtres ne retournent jamais une fiche d’un autre profil.
- [ ] Les exports unitaires et globaux ne contiennent que les données du profil actif.
- [ ] Le dossier de sauvegarde et la date du dernier snapshot sont propres à chaque profil.

## 2.3 Limite et suppression

- [ ] Facultatif : créer jusqu’à cinq profils et vérifier que la création d’un sixième est bloquée avec un message compréhensible.
- [ ] Ouvrir la suppression d’un profil mixte : le dialogue annonce correctement le nombre de Films, Séries, Livres, Jeux et œuvres concernés.
- [ ] Annuler la suppression conserve le profil et toutes ses fiches.
- [ ] Confirmer la suppression d’un profil non actif : seul ce profil disparaît.
- [ ] La suppression d’un profil n’est jamais déclenchée par un import.
- [ ] **À faire en fin de recette seulement** : supprimer le profil actuellement ouvert et vérifier le retour à l’onboarding annoncé.
- [ ] **Destructif, tout à la fin** : supprimer le dernier profil et vérifier que Sylloge revient proprement au premier lancement, sans écran cassé.

### Observation d’expérience

- [ ] Le modèle mental « un profil = une personne avec cinq collections » est compréhensible.
- [ ] La portée définitive d’une suppression est claire avant confirmation.
- [ ] Le profil actif est suffisamment visible avant une restauration ou un remplacement.

---

# 3. Contrôles communs aux cinq médiums

Répéter cette section pour Films, Séries, Livres, Jeux et Art.

## 3.1 Création minimale

- [ ] Ouvrir le formulaire d’ajout.
- [ ] Tenter d’enregistrer sans titre : une erreur explicite apparaît et aucune fiche n’est créée.
- [ ] Enregistrer avec le titre seul : la fiche est créée.
- [ ] Les valeurs par défaut de statut et de catégorie/forme sont cohérentes.
- [ ] La fiche minimale affiche un fallback visuel propre, sans image cassée.
- [ ] Le compteur de la sidebar augmente exactement de 1.

## 3.2 Création complète

- [ ] Renseigner tous les champs pertinents du médium.
- [ ] Vérifier les notes par demi-point de 0,5 à 5 lorsque le médium possède une note.
- [ ] Vérifier le favori.
- [ ] Vérifier une date antérieure et l’action « Utiliser aujourd’hui » lorsqu’elle est proposée.
- [ ] Vérifier les accents, emojis, apostrophes et retours à la ligne dans les textes.
- [ ] Vérifier que les espaces en début et fin de titre ne produisent pas un titre visuellement mal enregistré.
- [ ] Vérifier l’aperçu de l’image avec une URL HTTP(S) valide.
- [ ] Vérifier qu’une URL non HTTP(S) ou syntaxiquement invalide est refusée clairement.
- [ ] Vérifier qu’une URL HTTP(S) inaccessible n’empêche pas l’enregistrement et déclenche le fallback.
- [ ] Après enregistrement, comparer chaque champ de la fiche à ce qui a été saisi.

## 3.3 Modification

- [ ] Modifier le titre, le statut, le favori, la note, la date, l’avis et un champ spécifique.
- [ ] Enregistrer puis revenir à la collection : la carte reflète les modifications utiles.
- [ ] Rouvrir la fiche : toutes les modifications sont présentes.
- [ ] Vider un champ facultatif précédemment rempli : il disparaît proprement après enregistrement et relance.
- [ ] Annuler une autre modification : aucune valeur ne change.
- [ ] Vérifier qu’un double clic rapide sur Enregistrer ne crée pas de doublon.

## 3.4 Suppression

- [ ] Ouvrir la suppression puis annuler : la fiche reste intacte.
- [ ] Confirmer la suppression : seule la fiche visée disparaît.
- [ ] Le compteur diminue exactement de 1.
- [ ] La fiche ne réapparaît ni après recherche, ni après changement de profil, ni après relance.

### Observation d’expérience

- [ ] Le titre seul constitue réellement une création minimale utilisable.
- [ ] Les champs secondaires sont regroupés de manière compréhensible.
- [ ] Les libellés parlent du bon médium et ne donnent pas l’impression d’un formulaire Film recyclé.
- [ ] Les statuts proposés correspondent à une bibliothèque culturelle et non à un tracker de productivité.

---

# 4. Films

## 4.1 Champs et statuts

- [ ] Vérifier les statuts **À découvrir, En attente, Terminé, Abandonné**.
- [ ] Vérifier le titre original, l’année, la réalisation, le résumé, la note, le favori, la date de visionnage, l’affiche et le texte personnel.
- [ ] Passer à Terminé sans date : la date reste facultative et « Utiliser aujourd’hui » fonctionne.
- [ ] Tester une année manifestement invalide et vérifier que l’enregistrement est bloqué proprement.

## 4.2 Recherche et filtres

- [ ] Rechercher par titre.
- [ ] Rechercher par titre original.
- [ ] Rechercher par réalisation.
- [ ] Vérifier les filtres Tous, À découvrir, Terminés et Favoris.
- [ ] Combiner recherche et filtre.
- [ ] Une recherche sans résultat affiche un état vide compréhensible et permet de revenir à tous les Films.
- [ ] Les caractères `%` et `_` dans une recherche ne produisent pas de résultats sauvages inattendus.

## 4.3 Métadonnées TMDB, avec réseau

- [ ] Choisir le parcours d’enrichissement assisté lors de l’ajout.
- [ ] Rechercher un film et vérifier que les résultats correspondent à la requête.
- [ ] Annuler avant sélection : aucune fiche n’est créée.
- [ ] Choisir un résultat : les champs sont préremplis seulement après le choix explicite.
- [ ] Modifier manuellement un champ prérempli avant enregistrement : la modification humaine est conservée.
- [ ] Vérifier l’attribution TMDB à proximité de la présentation enrichie et dans À propos.
- [ ] Vérifier le choix d’affiche s’il est proposé et sa persistance après relance.

## 4.4 Métadonnées TMDB, hors ligne ou réseau défaillant

- [ ] Couper temporairement le réseau puis ouvrir une fiche Film existante : la fiche personnelle reste consultable.
- [ ] Lancer une recherche TMDB hors ligne : l’échec est compréhensible et permet de revenir à la saisie manuelle.
- [ ] Créer et modifier un Film manuellement hors ligne.
- [ ] Vérifier qu’aucune erreur réseau ne bloque les quatre autres médiums.

---

# 5. Séries

## 5.1 Catégories, recherche et statuts

- [ ] Vérifier les catégories **Série télé** et **Animation**.
- [ ] Vérifier les statuts **À voir, En cours, Abandonnée, Vue**.
- [ ] Rechercher par titre, showrunner et casting.
- [ ] Vérifier les vues Tous, Série télé et Animation.
- [ ] Combiner recherche et catégorie.
- [ ] Vérifier que les résultats récents réagissent à une modification d’avancement.

## 5.2 Progression par saisons

- [ ] En statut À voir, vérifier que l’avancement n’est pas imposé inutilement.
- [ ] Passer En cours et utiliser les boutons +/− pour les saisons vues et le total.
- [ ] Vérifier qu’on ne peut pas descendre sous zéro.
- [ ] Vérifier que les saisons vues ne peuvent pas dépasser le total connu.
- [ ] Marquer la série Vue avec un total connu : les saisons vues s’alignent sur le total.
- [ ] Sur une série Vue, augmenter ensuite le total : le statut repasse En cours.
- [ ] Vérifier le comportement du statut Abandonnée avec un avancement partiel.
- [ ] Enregistrer, relancer et vérifier les deux compteurs et le statut.

## 5.3 Fiche complète

- [ ] Vérifier showrunner, casting multiligne, résumé, note, avis, favori, début du visionnage et affiche.
- [ ] Vérifier que la fiche parle de la série entière, sans suivi par épisode ni saison détaillée.

---

# 6. Livres

## 6.1 Catégories, recherche et statuts

- [ ] Vérifier les catégories **Livre, Manga, Comics**.
- [ ] Vérifier les statuts **À lire, En cours, Abandonné, Lu**.
- [ ] Rechercher par titre, auteur/autrice et résumé.
- [ ] Vérifier les vues Tous, Livre, Manga et Comics.
- [ ] Combiner recherche et catégorie.

## 6.2 Progression des Manga et Comics

- [ ] Pour un Livre simple, vérifier que les compteurs de tomes ne sont pas affichés.
- [ ] Pour un Manga, saisir tomes lus et total avec les boutons +/−.
- [ ] Pour un Comics, répéter la mécanique.
- [ ] Vérifier qu’on ne peut pas descendre sous zéro ni dépasser le total.
- [ ] Marquer Lu avec un total connu : les tomes lus s’alignent sur le total.
- [ ] Augmenter le total d’une œuvre Lue : elle repasse En cours.
- [ ] Passer un Manga/Comics en catégorie Livre : les compteurs de tomes sont supprimés.
- [ ] Enregistrer, relancer et vérifier progression et statut.

## 6.3 Citations

- [ ] Créer un Livre avec trois citations, dont une longue et multiligne.
- [ ] Vérifier l’ordre des citations sur la fiche.
- [ ] Modifier la deuxième citation sans modifier les autres.
- [ ] Retirer une citation et vérifier que les autres restent dans le bon ordre.
- [ ] Ajouter une citation vide et vérifier le comportement de validation.
- [ ] Relancer l’application et vérifier que citations et ordre sont conservés.
- [ ] Supprimer le Livre et vérifier que ses citations ne réapparaissent jamais.

## 6.4 Fiche complète

- [ ] Vérifier auteur/autrice, année, résumé, note, avis, favori, début de lecture et couverture.
- [ ] Vérifier qu’aucun champ de pagination, édition, traduction ou relecture n’a été ajouté par erreur.

---

# 7. Jeux

## 7.1 Champs et statuts

- [ ] Vérifier les statuts **À jouer, En cours, Joué, Abandonné, Regardé**.
- [ ] Vérifier le studio/développeur, la plateforme, l’année, la note, l’avis, le favori, la date de jeu ou visionnage et la couverture.
- [ ] Vérifier que Regardé convient à un let’s play ou une vidéo sans imposer de temps de jeu.
- [ ] Vérifier qu’aucun temps de jeu, historique de sessions ou objectif chiffré n’apparaît.

## 7.2 Plateformes libres

- [ ] Ouvrir les suggestions de plateforme et vérifier la présence de PC et des consoles principales.
- [ ] Saisir une plateforme libre absente de la liste, par exemple `Steam Deck`.
- [ ] Créer une deuxième fiche : `Steam Deck` est maintenant proposée.
- [ ] Saisir la même plateforme avec une casse différente : les filtres ne doivent pas afficher deux doublons.
- [ ] Laisser la plateforme vide : la fiche reste valide.

## 7.3 Recherche et filtres

- [ ] Rechercher par titre.
- [ ] Rechercher par studio/développeur.
- [ ] Rechercher par plateforme.
- [ ] Vérifier que seuls les boutons de plateformes réellement présentes sont proposés comme filtres.
- [ ] Filtrer par plateforme puis combiner avec une recherche.
- [ ] Supprimer la dernière fiche d’une plateforme et vérifier que le filtre obsolète disparaît ou permet de revenir clairement à Toutes.
- [ ] Une recherche sans résultat affiche un état récupérable.

### Observation d’expérience

- [ ] Le nombre de boutons de plateforme reste praticable avec plusieurs plateformes.
- [ ] La saisie libre est plus évidente qu’une liste fermée.
- [ ] La différence entre Joué et Regardé est compréhensible sans explication externe.

---

# 8. Art

## 8.1 Formes, statuts et absence de note

- [ ] Vérifier les formes **Peinture, Sculpture, Photographie, Dessin, Poésie, Gravure, Performance, Art conceptuel, Autre**.
- [ ] Vérifier les statuts **À découvrir** et **Découverte**.
- [ ] Vérifier artiste, année, lieu, exposition, avis, favori, date de découverte et visuel.
- [ ] Vérifier qu’aucun champ de note n’apparaît dans le formulaire, la fiche, la carte, l’import ou l’export.
- [ ] Vérifier que lieu et exposition sont de simples textes libres, sans création de catalogue ou relation.

## 8.2 Recherche et filtres

- [ ] Rechercher par titre.
- [ ] Rechercher par artiste.
- [ ] Rechercher par lieu.
- [ ] Rechercher par exposition.
- [ ] Vérifier les neuf filtres de forme et le filtre Toutes.
- [ ] Combiner recherche et forme.
- [ ] Une recherche sans résultat affiche un état récupérable.

## 8.3 Cas sans image et Poésie

- [ ] Créer une œuvre sans visuel : le fallback indique clairement qu’il s’agit d’un visuel d’œuvre.
- [ ] Créer une Poésie sans image et vérifier que le parcours reste naturel.
- [ ] Créer une œuvre avec une image inaccessible : la fiche reste utilisable et aucun recadrage destructeur n’apparaît.

### Observation d’expérience

- [ ] Les nombreux boutons de forme restent lisibles sans dominer excessivement la bibliothèque.
- [ ] Le mot « œuvre » et les libellés restent naturels pour Peinture, Poésie et Performance.
- [ ] L’absence de note paraît volontaire, pas accidentelle.

---

# 9. Recherche, filtres et résultats croisés

À exercer après avoir rempli `QA Principal`.

- [ ] Chaque recherche est limitée au médium ouvert.
- [ ] Chaque recherche est limitée au profil actif.
- [ ] Les recherches ignorent raisonnablement la casse.
- [ ] Tester des accents et variantes de casse dans les requêtes.
- [ ] Tester une apostrophe, `%`, `_`, tiret et espaces en début/fin.
- [ ] Effacer la recherche restaure la collection complète.
- [ ] Changer de filtre pendant une recherche actualise immédiatement le résultat.
- [ ] Changer de profil remet les recherches et filtres à un état compréhensible.
- [ ] Créer ou modifier une fiche pendant qu’un filtre est actif actualise correctement les résultats au retour.
- [ ] Supprimer une fiche pendant qu’un filtre est actif actualise le compteur.
- [ ] Les compteurs de résultats emploient correctement singulier et pluriel.
- [ ] Une erreur de recherche n’efface aucune donnée et propose Réessayer.

### Observation d’expérience

- [ ] Les filtres ont la même logique générale sans effacer les différences propres à chaque médium.
- [ ] L’état « aucun résultat » aide à revenir à la collection plutôt que de donner l’impression que les données ont disparu.

---

# 10. Export unitaire par médium

Répéter pour Films, Séries, Livres, Jeux et Art depuis `QA Principal`.

- [ ] Le bouton **Exporter** est présent dans la bibliothèque concernée.
- [ ] Annuler le dialogue natif n’écrit aucun fichier et affiche un message non alarmant.
- [ ] Choisir un emplacement : le fichier JSON est créé avec un nom compréhensible.
- [ ] Ouvrir le JSON avec un éditeur de texte : il est lisible et encodé en UTF-8.
- [ ] Les cinq exports unitaires utilisent le document JSON versionné `sylloge-library` v2 ; seule la collection du médium exporté est renseignée.
- [ ] Le profil de l’export correspond au profil actif.
- [ ] Dans chaque export unitaire, les quatre autres tableaux sont vides ; l’export JSON à cinq collections est une action distincte des Paramètres.
- [ ] Les accents, emojis, retours à la ligne et champs vides sont fidèles.
- [ ] Les identifiants et champs techniques ne rendent pas le document illisible.
- [ ] Les images restent des URL facultatives ; aucune image binaire n’est intégrée.
- [ ] Pour Livres, les citations et leur ordre sont présents.
- [ ] Pour Art, aucune note n’apparaît.
- [ ] Pour Films enrichis, aucune clé secrète, aucun cache brut, aucun crédit ou liste d’affiches TMDB n’apparaît.

### Export CSV unitaire

Répéter depuis la bibliothèque concernée puis depuis Paramètres → Importer et exporter pour **Films, Séries, Livres, Jeux et Art**.

- [ ] Les deux emplacements ouvrent le même dialogue natif et proposent un export CSV de la collection visée.
- [ ] Annuler une première fois : aucun fichier n’est écrit et le message indique une annulation non alarmante.
- [ ] Exporter réellement puis ouvrir le CSV dans un éditeur et dans un tableur.
- [ ] Les accents, virgules, guillemets, retours à la ligne, dates et champs vides restent lisibles sans décalage de colonne.
- [ ] Aucun contenu des quatre autres médiums n’est mélangé au CSV unitaire.
- [ ] Vérifier le nom de fichier et le préfixe cohérents avec le médium exporté.
- [ ] **Séries** : saisons vues et saisons totales restent deux colonnes distinctes.
- [ ] **Livres** : `book_quotes_json` est une cellule lisible contenant les citations dans le bon ordre ; la présence de virgules, guillemets ou retours à la ligne dans une citation ne casse pas le CSV.
- [ ] **Jeux** : la plateforme libre, la note et l’avis restent lisibles.
- [ ] **Art** : forme, artiste, lieu, exposition et avis restent lisibles ; aucune colonne de note n’est présente.
- [ ] Les valeurs commençant par `=`, `+`, `-`, `@` ou une apostrophe ne sont pas interprétées comme formules par le tableur.
- [ ] Aucun CSV ne contient le cache TMDB, une clé, une image binaire ou un autre secret.
- [ ] Noter que seuls les Films sont réimportables en CSV à ce stade ; les imports CSV Séries, Livres, Jeux et Art relèvent du jalon `0.4.16`.

---

# 11. Import unitaire par médium

Faire ces essais dans `QA Import`. Avant chaque scénario, noter le nombre de fiches des cinq médiums.

## 11.1 Principes communs

- [ ] Le bouton **Importer** est présent dans chaque bibliothèque livrée.
- [ ] Avant le sélecteur, l’assistant explique le format réellement accepté.
- [ ] Annuler le sélecteur n’écrit aucune donnée.
- [ ] Choisir un JSON malformé : l’import est bloqué avec un message compréhensible.
- [ ] Choisir un JSON Sylloge valide mais contenant une valeur invalide : aucune écriture partielle ne subsiste.
- [ ] L’utilisateur doit choisir explicitement **Remplacer** ou **Fusionner** avant l’écriture.
- [ ] Pendant l’écriture, les actions qui pourraient lancer un second import sont désactivées.
- [ ] Après succès, le rapport annonce correctement ajouts, mises à jour et remplacements.
- [ ] Relancer l’application confirme que l’import est bien persisté.

## 11.2 Remplacer sans toucher aux autres médiums

Pour chaque médium :

- [ ] Créer au préalable une fiche dans chacun des cinq médiums de `QA Import`.
- [ ] Importer l’export unitaire du médium testé avec **Remplacer**.
- [ ] La collection ciblée est remplacée par le contenu du fichier.
- [ ] Les quatre autres collections du profil sont strictement inchangées.
- [ ] Le profil n’est ni créé, ni renommé, ni supprimé.
- [ ] Aucun identifiant en conflit ne produit de doublon ou d’échec silencieux.

## 11.3 Fusion sans doublon

- [ ] Partir d’une collection contenant une fiche locale différente de toutes celles du fichier.
- [ ] Choisir **Fusionner**.
- [ ] La fiche locale reste présente et les nouvelles fiches sont ajoutées.
- [ ] Les quatre autres médiums restent inchangés.

## 11.4 Fusion avec doublon normalisé

Préparer localement une fiche `Été Bleu` et importer une fiche `ete bleu` ou `ÉTÉ   BLEU`.

- [ ] Le doublon est détecté malgré casse, accents et espaces.
- [ ] Le résumé des deux fiches permet de savoir laquelle est locale et laquelle est importée.
- [ ] Choisir **Garder l’existant** : note, avis, favori, progression et dates personnelles locales sont conservés.
- [ ] Avec Garder l’existant, un champ éditorial local vide peut être complété depuis l’import.
- [ ] Refaire le scénario dans un profil jetable avec **Garder l’importé** : la fiche importée remplace bien les choix locaux après consentement explicite.
- [ ] Deux fiches ne subsistent pas après résolution d’un doublon.
- [ ] Plusieurs doublons peuvent recevoir des choix différents dans le même import.

## 11.5 Particularités par médium

- [ ] **Films** : JSON, CSV UTF-8 et ZIP compatible sont les formats annoncés.
- [ ] **Séries** : catégories et compteurs de saisons restent fidèles.
- [ ] **Livres** : citations locales restent intactes si l’existant est conservé ; citations importées arrivent avec une nouvelle fiche.
- [ ] **Jeux** : plateforme libre, note et avis restent fidèles.
- [ ] **Art** : lieu, exposition et forme restent fidèles ; aucune note n’est introduite.

---

# 12. Import Films CSV et conteneur ZIP compatible

À exercer avec un vrai export ou une fixture anonymisée, pas avec un fichier inventé qui ne correspond à aucun outil réel.

## 12.1 CSV Films

- [ ] L’assistant identifie les colonnes disponibles avant écriture.
- [ ] Le mapping source → destination est compréhensible et modifiable.
- [ ] Les colonnes absentes restent vides sans données inventées.
- [ ] Une note `/10` est convertie visiblement vers `/5`.
- [ ] Les lignes valides et invalides sont comptées correctement dans l’aperçu.
- [ ] Une valeur invalide bloque l’écriture ou est signalée conformément à l’aperçu, sans import partiel silencieux.
- [ ] Les accents, virgules, guillemets et retours à la ligne sont conservés.
- [ ] Remplacer et Fusionner suivent les mêmes règles que le JSON Films.

## 12.2 Conteneur ZIP historique Film

- [ ] Le ZIP réel est accepté sans extraction manuelle préalable.
- [ ] Si plusieurs CSV sont présents, l’utilisateur peut identifier la bonne source.
- [ ] Les propriétés viennent du CSV et les notes longues des pages Markdown correspondantes.
- [ ] L’aperçu indique clairement ce qui sera importé.
- [ ] Une URL Notion temporaire n’est pas conservée comme affiche permanente.
- [ ] Annuler avant confirmation ne crée aucune fiche.
- [ ] Un ZIP invalide, trop volumineux ou excessivement imbriqué est refusé sans écriture.

### Observation d’expérience

- [ ] L’ordre **format → fichier → aperçu/mapping → Remplacer/Fusionner → résultat** paraît naturel.
- [ ] À aucun moment l’utilisateur ne peut croire qu’un simple choix de fichier a déjà écrasé sa collection.

---

# 13. Export et restauration globale

## 13.1 Export global mixte

Depuis `QA Principal`, rempli avec les cinq médiums :

- [ ] Paramètres → Importer et exporter distingue clairement le JSON à cinq collections des exports unitaires.
- [ ] Annuler l’export n’écrit aucun fichier.
- [ ] Exporter réellement le JSON des cinq collections.
- [ ] Le message final annonce le bon nombre pour les cinq médiums.
- [ ] Ouvrir le JSON et vérifier les cinq tableaux `films`, `series`, `books`, `games`, `artworks`.
- [ ] Vérifier au moins une fiche complète et une fiche minimale de chaque médium.
- [ ] Vérifier les citations de Livres et l’absence de note pour Art.
- [ ] Vérifier que le document ne contient ni cache TMDB brut, ni clé, ni données d’un autre profil.

## 13.2 Refus sur profil non vide

- [ ] Ouvrir `QA Import`, qui contient au moins une fiche dans n’importe quel médium.
- [ ] Tenter de restaurer l’export global.
- [ ] La restauration est refusée **avant écriture**, avec une explication qui propose un profil vide ou le vidage du profil courant.
- [ ] Les cinq collections de `QA Import` sont inchangées après le refus et après relance.

## 13.3 Restauration dans un profil vide

- [ ] Ouvrir `QA Vide` et vérifier que les cinq compteurs sont à zéro.
- [ ] Restaurer l’export global de `QA Principal`.
- [ ] Les cinq collections sont restaurées dans `QA Vide` dans une seule opération cohérente.
- [ ] Le profil reste `QA Vide` : l’import ne crée pas automatiquement un autre profil.
- [ ] Les nombres annoncés correspondent aux cinq collections restaurées.
- [ ] Vérifier une fiche complète par médium, une citation, une progression, un favori et un fallback.
- [ ] Fermer puis relancer l’application : toute la restauration persiste.
- [ ] Tenter immédiatement une seconde restauration globale dans ce profil désormais non vide : elle est refusée sans modification.

## 13.4 Compatibilité Films historique

Si un vrai export `sylloge-films` v1 historique est disponible :

- [ ] Créer un nouveau profil vide.
- [ ] Restaurer le v1 historique depuis le parcours global.
- [ ] Les Films sont restaurés et les quatre nouvelles collections restent vides.
- [ ] Les accents, dates, notes et champs facultatifs sont conservés.
- [ ] L’application reste ensuite capable d’ajouter Séries, Livres, Jeux et Art dans ce profil migré.

### Observation d’expérience

- [ ] La différence entre **export unitaire**, **export global** et **snapshot** est compréhensible.
- [ ] L’import global paraît être une restauration complète, pas une fusion cachée.
- [ ] Le refus sur profil non vide aide réellement à choisir la suite.

---

# 14. Sauvegardes et snapshots

## 14.1 Configuration par profil

- [ ] Dans `QA Principal`, Paramètres → Sauvegardes indique que la fonction est inactive sans dossier.
- [ ] Annuler le choix de dossier laisse le réglage précédent inchangé.
- [ ] Choisir un dossier local dédié à la recette.
- [ ] Le chemin affiché correspond au dossier choisi.
- [ ] Ouvrir `QA Import` : le réglage de `QA Principal` ne doit pas être réutilisé silencieusement.
- [ ] Configurer un autre dossier pour `QA Import` et revenir à `QA Principal` : chaque profil retrouve son dossier.

## 14.2 Snapshot manuel

- [ ] Cliquer **Sauvegarder maintenant**.
- [ ] Un fichier JSON apparaît réellement dans le dossier choisi.
- [ ] Le message de succès cite un fichier cohérent.
- [ ] Le JSON contient fidèlement les cinq collections du profil actif.
- [ ] Créer deux snapshots manuels successifs : deux opérations explicites réussissent sans écraser silencieusement un fichier inattendu.

## 14.3 Snapshot automatique quotidien

- [ ] Après configuration, modifier avec succès une fiche.
- [ ] Vérifier qu’un snapshot automatique du jour est créé.
- [ ] Effectuer une deuxième modification le même jour : aucun deuxième snapshot automatique quotidien n’est créé pour ce profil.
- [ ] Un snapshot manuel reste possible le même jour.
- [ ] Dans un autre profil configuré, la première modification du jour peut créer son propre snapshot.
- [ ] Une modification échouée ou annulée ne crée pas de snapshot.

## 14.4 Fidélité et sécurité

- [ ] Le snapshot est un JSON lisible, pas une copie de `sylloge.db`, du WAL ou du SHM.
- [ ] Il contient Films, Séries, Livres, Jeux et Art.
- [ ] Il contient les citations des Livres.
- [ ] Il ne contient pas le cache TMDB séparé ni de secret.
- [ ] Un dossier non utilisable produit une erreur sans remplacer le réglage précédent.
- [ ] Changer de dossier réinitialise proprement la destination du prochain snapshot.
- [ ] Facultatif et long : vérifier qu’au-delà de 30 snapshots suivis pour un profil, seuls les plus anciens snapshots **créés par Sylloge** sont supprimés.
- [ ] Facultatif : placer dans le dossier un fichier ressemblant à un snapshot mais non créé par Sylloge ; la rétention ne doit jamais le supprimer.

---

# 15. Bibliothèque mixte et cohérence transversale

- [ ] `QA Principal` contient au moins une fiche de chacun des cinq médiums.
- [ ] Les cinq compteurs de sidebar sont justes simultanément.
- [ ] Changer le favori, le statut ou la note dans un médium n’affecte aucun autre médium.
- [ ] Art ne reçoit jamais de note par réutilisation accidentelle d’un composant commun.
- [ ] Séries et Livres conservent leurs progressions spécifiques.
- [ ] Jeux conserve une plateforme libre sans nouvelle entité ou écran de catalogue.
- [ ] Les fallbacks parlent d’affiche, couverture ou visuel selon le médium.
- [ ] L’export global puis la restauration conservent toutes ces différences.
- [ ] Remplacer une seule collection ne touche pas les quatre autres.
- [ ] Supprimer une fiche avec des données liées, notamment les citations, ne laisse pas de contenu orphelin visible.

### Composition et logique produit

Pour chacune de ces questions, noter **OK**, **friction** ou **problème de logique** :

- [ ] L’entrée de chaque médium dans la sidebar est légitime et compréhensible.
- [ ] Les actions Ajouter, Importer et Exporter sont au bon niveau de la bibliothèque.
- [ ] Les Paramètres restent réservés aux profils, transferts globaux, sauvegardes, application et informations générales.
- [ ] Aucun écran ne promet un format d’import inexistant.
- [ ] Le niveau global ne duplique pas inutilement les actions unitaires.
- [ ] Un utilisateur peut comprendre où restaurer une bibliothèque complète sans connaître SQLite ou JSON.
- [ ] Le vocabulaire reste cohérent entre carte, fiche, formulaire, filtre, import et rapport final.
- [ ] La quantité de contrôles visibles reste proportionnée au besoin réel de chaque médium.
- [ ] Les différences métier sont préservées sans donner l’impression de cinq applications séparées.
- [ ] Rien ne transforme Sylloge en tracker, réseau social ou plateforme de recommandation.

---

# 16. États d’erreur et robustesse native

- [ ] Annuler chaque dialogue natif de fichier ou dossier revient proprement à l’application.
- [ ] Importer un fichier vide.
- [ ] Importer un fichier texte renommé en `.json`.
- [ ] Importer un JSON syntaxiquement valide mais d’un schéma inconnu.
- [ ] Importer un document avec un statut ou une forme invalide.
- [ ] Importer un document avec des champs facultatifs à `null`, puis un document auquel une propriété attendue a été retirée : le résultat doit être explicite et aucune écriture partielle ne doit subsister.
- [ ] Tester une note personnelle très longue et multiligne.
- [ ] Tester des caractères non latins et emojis dans les titres et avis.
- [ ] Tester une URL d’image invalide puis inaccessible.
- [ ] Couper le réseau pendant l’usage hors TMDB : toutes les fonctions locales restent disponibles.
- [ ] Fermer la fenêtre pendant un écran non destructif puis relancer : l’application retrouve une base cohérente.
- [ ] Cliquer rapidement deux fois sur Créer, Enregistrer, Importer ou Sauvegarder : aucune duplication inattendue.
- [ ] En cas d’erreur, le message distingue clairement échec, annulation et succès.
- [ ] Après une erreur d’import, fermer et relancer pour vérifier qu’aucune écriture partielle n’a été conservée.

---

# 17. Contrôle clavier et compréhension minimale

Ce n’est pas un audit design complet, mais les parcours de données doivent rester opérables.

- [ ] Naviguer au clavier dans un formulaire complet.
- [ ] Le focus est visible sur boutons, champs et filtres.
- [ ] Ouvrir un assistant d’import : le focus entre dans le dialogue.
- [ ] Tab et Maj+Tab restent dans le dialogue.
- [ ] Échap ferme le dialogue quand aucune écriture n’est en cours.
- [ ] Après fermeture, le focus revient sur le bouton qui a ouvert le dialogue.
- [ ] Une erreur de formulaire est associée au champ concerné.
- [ ] Les fallbacks visuels possèdent un libellé compréhensible.
- [ ] Les boutons de filtre exposent clairement leur état actif.
- [ ] Une confirmation destructive peut être annulée sans effet.

---

# 18. Migration depuis une installation Films existante — test avancé

À faire seulement après un export global valide et une sauvegarde à froid. Ne pas manipuler la SQLite active.

- [ ] Fermer complètement Sylloge.
- [ ] Conserver une copie à froid d’une ancienne donnée Films réelle ou d’une fixture de migration prévue à cet effet.
- [ ] Lancer la version actuelle sur cette donnée selon la procédure de test choisie.
- [ ] L’application démarre sans effacer ni dupliquer les Films.
- [ ] Les statuts Films historiques restent valides après migration.
- [ ] Les quatre nouvelles bibliothèques sont disponibles et initialement vides.
- [ ] Ajouter une fiche dans chacun des nouveaux médiums.
- [ ] Exporter globalement puis restaurer dans un profil vide.
- [ ] Vérifier que les Films historiques et les quatre nouveaux médiums coexistent correctement.
- [ ] Vérifier que l’application peut être relancée plusieurs fois sans rejouer une migration destructive.

---

# 19. Test de durée et usage naturel

Après les scénarios mécaniques, utiliser Sylloge pendant 15 à 30 minutes sans suivre la checklist :

- [ ] Ajouter naturellement plusieurs œuvres auxquelles tu penses réellement.
- [ ] Modifier une progression de Série ou Manga.
- [ ] Chercher une fiche dont tu ne te souviens que de l’auteur, du studio, du lieu ou de la plateforme.
- [ ] Changer de profil puis revenir.
- [ ] Exporter une collection et faire une sauvegarde manuelle.
- [ ] Noter chaque moment où tu hésites sur l’endroit où cliquer ou la portée d’une action.
- [ ] Noter les champs qui semblent inutiles, manquants ou mal nommés, sans conclure immédiatement qu’il faut les ajouter.
- [ ] Noter les composants qui semblent trop denses ou trop pauvres pour leur rôle fonctionnel.

Le but de cette phase est de détecter les défauts de modèle mental que les scénarios guidés ne révèlent pas.

---

# 20. Gate de fin de recette

La validation `0.5.0` ne doit pas être donnée tant que les points suivants ne sont pas vrais :

- [ ] Aucun P0 ouvert.
- [ ] Aucun P1 ouvert sur un parcours obligatoire.
- [ ] Les P2 connus ont une décision explicite : corriger avant release ou accepter avec justification.
- [ ] Les cinq CRUD sont utilisables et persistants.
- [ ] Les profils isolent correctement toutes les collections.
- [ ] Les imports unitaires Remplacer/Fusionner ont été exercés.
- [ ] L’export et la restauration globale mixtes ont été exercés.
- [ ] Les snapshots mixtes ont été ouverts et contrôlés.
- [ ] La compatibilité d’un export Films v1 réel ou d’une fixture officielle a été vérifiée.
- [ ] Le parcours local hors ligne reste utilisable.
- [ ] Les contrôles automatisés sont relancés après les corrections issues de la QA.

---

# Journal des anomalies

Copier ce bloc pour chaque problème :

```text
ID : QA-
Gravité : P0 / P1 / P2 / P3 / Observation produit
Zone : Films / Séries / Livres / Jeux / Art / Profils / Import / Export / Sauvegardes / Global
Profil actif :
État initial :
Étapes exactes :
1.
2.
3.
Résultat attendu :
Résultat observé :
Reproductible après relance : oui / non / non testé
Impact sur les données : aucun / doute / perte / duplication / mélange
Fichier utilisé :
Capture ou message exact :
Décision : à corriger / à discuter / accepté
```

## Synthèse finale

- Date :
- Version ou commit testé :
- Durée :
- Sections entièrement exercées :
- Sections non exercées :
- P0 :
- P1 :
- P2 :
- P3 :
- Observations produit :
- Verdict : bloqué / corrections requises / prêt pour revue finale 0.5.0
