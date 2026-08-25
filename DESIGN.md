# Sylloge — contrat visuel V1

> **Statut :** direction validée par Aurélien le 22 août 2026 (jalon `0.5.1`), à partir des maquettes `sylloge-design-051/04-direction-validee` (bibliothèque) et `09-fiche-v5` (fiche film). Ce contrat fait foi pour tous les écrans du train `0.6.0`. Il remplace la version « Archive calme » antérieure.

## Principes

- Une bibliothèque personnelle chaleureuse : papier chaud, œuvres en couleur, interface qui s'efface.
- Deux matières jamais mélangées : **l'œuvre** (données fixes, posées sur le papier sans conteneur) et **la personne** (statut, note, avis, toujours identifiables comme siens).
- Le violet encre ne colore que trois choses : l'action principale, le coup de cœur, l'élément actif d'une navigation ou d'une vue. Tout le reste reste neutre ; la couleur vient des affiches et couvertures.
- Densité moyenne, respiration constante, pas de look SaaS ni de dashboard.

## Tokens par rôle

- Fonds : `--color-canvas: #FAF9F6` (papier), `--color-surface: #FFFFFF` (cartes et champs), surfaces discrètes en `rgba(31,29,26,0.05)`.
- Texte : `--color-text: #1F1D1A`, `--color-text-muted: #6E6A61`, `--color-text-subtle: #A39E93`.
- Structure : `--color-border: #E8E4DC`, filets internes `#EFECE5`.
- Interaction : `--color-accent: #5B3A68` (violet encre), `--color-accent-soft: #F0E8F3`.
- Voix personnelle : `--color-personal: #473952` (prune profond) pour les avis rédigés.
- Danger : `#9C3B2E`.

## Typographie — deux voix

- **Voix encyclopédie** : pile système sans-serif (`-apple-system…`). Titres en graisse 800 avec interlettrage resserré (`-0.8px` au-delà de 30 px), libellés de section en petites capitales espacées (`10-11px`, `+1.4px`), textes courants 13 px.
- **Voix personnelle** : tout avis rédigé par la personne est en serif système (`ui-serif, "New York", Georgia, serif`), 15-15.5 px, interligne 1.8, teinte prune, filet vertical violet à gauche. Cette règle vaut pour les cinq médiums.
- Les métadonnées techniques de l'œuvre (fiche technique) utilisent des libellés subtils en capitales et des valeurs en texte normal.

## Formes et composants

- Arrondis généreux : affiches et grandes cartes 14-20 px, contrôles et champs en **pilule pleine** (`border-radius: 99px`), menus 12 px.
- Bouton principal : pilule violette pleine, texte blanc, ombre portée très légère.
- Boutons secondaires : pilule bordée sur carte blanche.
- Actions tertiaires : texte violet ou gris sur pastille grise au survol.
- Segmented control (statuts) : groupe sur fond discret, élément actif en pastille encre pleine avec ombre courte.
- Élément actif de navigation : pilule encre pleine, texte papier, compteur tabulaire discret.
- Champ de recherche : pilule blanche bordée, placeholder subtil, `autoCorrect="off"` conservé.
- Ombres : uniquement sous les visuels et les éléments flottants, douces, jamais décoratives ailleurs.

## Sidebar

- Sur le même fond papier que le contenu, sans bordure verticale.
- Marque « Sylloge » + surtitre espacé, items en pilules avec glyphe et compteur, Paramètres en bas.
- Aucune section « Bibliothèque » : les cinq médiums sont directement visibles.

## Composition d'une fiche (référence : maquette 09-fiche-v5)

Ordre de lecture unique, du fixe vers le personnel :

1. Colonne gauche collante : **affiche** grande (320 px), puis **statut** en segmented control, puis **note /5 cliquable et coup de cœur**, puis action d'affiche discrète.
2. Bloc droit haut : surtitre du médium, **titre** en grand, titre original, ligne de faits (année · pays · durée · genres).
3. Grille d'informations de l'œuvre en deux colonnes à filets fins (réalisation, scénario, distribution, musique, pays, sortie — adaptées par médium), puis **résumé** en voix encyclopédie avec « Lire la suite », puis mention d'attribution fournisseur en subtil.
4. Séparateur hairline, puis **la partie personnelle dans la continuité immédiate** : date de visionnage ou de lecture seule, critique en voix personnelle serif-prune, action Modifier discrète.

Interdits de fiche : aucune donnée personnelle au milieu des données fournisseur ; aucune carte blanche autour de la partie personnelle ; aucune métadonnée technique affichée (dates d'ajout/modification restent en base, non rendues).

## Composition des formulaires en pop-up

- L'ajout et le bouton Modifier utilisent le même gabarit prérempli pour les cinq médiums.
- Sur ordinateur, la pop-up garde une géométrie stable en deux colonnes. L'affiche fixe la hauteur de la scène à gauche ; le changement de statut ne doit jamais déplacer ni agrandir la fenêtre.
- Socle partagé 0.6.20 : dans la colonne droite, l'ordre visible reste titre, données utiles, statut, date et avis personnel. Les actions demeurent ancrées en bas.
- Prototype Film 0.6.21, en attente de validation avant extension : le champ titre réserve la place de la croix ; l’affiche est ramenée à 306 px et garde sous elle une zone stable de verdict. En « Terminé » ou « Abandonné », cette zone montre seulement cinq grandes étoiles dorées à l’activation et un cœur rouge à l’activation, sans libellé numérique visible.
- Correction Film 0.6.22 : la date de visionnage partage la même rangée compacte que les statuts, à droite d’« Abandonné ». La fiche TMDB reste donc immobile et immédiatement sous cette rangée, quel que soit le statut. Le formulaire ne rend plus de champs secondaires Titre original, Année, Réalisation ou Résumé sous cette fiche.
- Pour le Film assisté ou associé, une fiche technique discrète dans la colonne droite présente les faits TMDB déjà récupérés : sortie, durée, réalisation, cinq interprètes principaux et titre original pertinent. Elle ne dépend jamais du statut personnel.
- Séries, Livres, Jeux et Art conservent intégralement le gabarit 0.6.20 tant que le prototype Film n’est pas explicitement validé.
- Les informations supplémentaires d'une fiche existante défilent à l'intérieur de la colonne droite. Les actions Annuler et Enregistrer restent ancrées en bas et visibles.
- Sur écran étroit, le formulaire repasse en une colonne et retrouve un défilement vertical classique.
- L'Art suit la même composition sans note ni statut, conformément au domaine.

## Bibliothèques

- Rangée d'outils : vues à gauche (onglets soulignés violets à l'actif), recherche pilule et actions filtre/tri à droite, séparateur vertical.
- Grilles d'affiches : titre, sous-titre, étoiles et pastille de statut sous le visuel ; survol par léger soulèvement et ombre accrue ; fallback neutre inchangé.
- Sous-titre éditorial sous le titre de page (ex. « 128 films dont 12 coups de cœur »).

## Accessibilité et mouvement

- Focus clavier visible partout : anneau `--color-accent-soft` épaissi, jamais supprimé.
- Contrastes : texte principal sur papier et sur carte ≥ 7:1, muted ≥ 4.5:1 ; le prune personnel ≥ 7:1 sur papier.
- Transitions courtes (90-160 ms) sur élévation et couleurs uniquement ; rien qui dépend d'une animation pour être compris ; respect de `prefers-reduced-motion` (tout devient instantané).
- Cibles tactiles et clic ≥ 30 px ; étoiles notables séparées d'au moins 2 px.

## Affiches et couvertures

- Rendues en `img` avec texte alternatif pertinent, toujours en couleur, sans filtre, teinte, dégradé ni recadrage destructeur.
- Fallback neutre typographique explicite quand l'image manque ou échoue ; jamais de fausse couverture générée.

## Anti-directions

- Pas de look SaaS, dashboard, verre, néon, dégradés décoratifs ou métriques inventées.
- Pas de données fabriquées pour meubler un écran : les états vides sont sobres et honnêtes.
- Aucune note pour l'Art, aucun préremplissage de données personnelles par un fournisseur : ces règles produit priment sur le design.
