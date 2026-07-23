# Contrat d’inspection des conteneurs d’import V1

**Statut :** normatif pour les jalons internes `0.4.17` et `0.4.18` du train `0.5.0`.

## Objet et non-objet

Un conteneur est seulement une manière de présenter des fichiers existants à l’import : un fichier ZIP choisi explicitement ou un dossier choisi explicitement. Il n’est ni un nouveau format de données, ni une sauvegarde, ni un mécanisme de synchronisation.

Les seuls formats de données publics recherchés dans un conteneur sont les fichiers **JSON** et **CSV** compatibles Sylloge. Leur analyse métier, leur aperçu, leur mapping, leurs erreurs, le choix **Remplacer / Fusionner** et l’écriture SQLite restent ceux du pipeline d’import déjà existant. L’inspection ne crée aucune fiche, ne modifie aucun profil et n’extrait aucun fichier sur disque.

L’adaptateur Film historique peut aussi lire certaines pages Markdown présentes dans un ZIP afin d’associer des notes longues à un CSV déjà sélectionné. Markdown n’est pas un format d’import général et n’apparaît pas comme tel dans l’interface.

Le jalon `0.4.17` fixe ce contrat et durcit l’adaptateur ZIP Film existant. Le sélecteur de dossier, la liste des candidats JSON/CSV et leur envoi vers les flux communs arrivent au jalon `0.4.18`.

## Parcours prévu

1. La personne choisit explicitement un ZIP ou un dossier ; aucun dossier n’est conservé, surveillé ou synchronisé.
2. L’inspection applique les limites ci-dessous avant de charger un contenu exploitable.
3. Les fichiers étrangers sont ignorés sans être décompressés ni lus inutilement.
4. S’il n’existe qu’un candidat compatible, l’interface le propose directement ; s’il y en a plusieurs, elle affiche leur chemin relatif et demande un choix explicite.
5. Le candidat choisi repart dans l’aperçu et la validation du médium visé. Toute erreur bloque donc l’écriture complète avant **Remplacer** ou **Fusionner**.

## Limites de sécurité

| Ressource | Limite V1 | Portée |
|---|---:|---|
| Fichier JSON ou CSV direct | 16 Mio | lecture UTF-8 avant analyse métier |
| ZIP sélectionné | 16 Mio | taille compressée sur disque |
| Entrée ZIP pertinente | 4 Mio | JSON, CSV, Markdown Film historique ou ZIP imbriqué |
| Contenu ZIP décompressé cumulé | 32 Mio | toutes les archives imbriquées confondues |
| Entrées ZIP | 512 | répertoires compris, toutes les archives imbriquées confondues |
| Chemin relatif | 8 segments | fichier compris ; exemple autorisé : `exports/2026/films.csv` |
| ZIP imbriqués | 4 niveaux | sous l’archive racine |
| Dossier choisi | 512 entrées, 8 segments, 32 Mio cumulés | règle à appliquer au sélecteur de dossier de `0.4.18` |

Une archive ZIP chiffrée est refusée explicitement : Sylloge ne demande ni ne conserve de mot de passe. Les entrées de type lien symbolique, les chemins absolus, les préfixes de volume et tout segment `..` sont refusés. Les fichiers JSON, CSV ou Markdown Film historique qui ne sont pas UTF-8 sont refusés ; les autres fichiers restent hors périmètre et sont ignorés.

Ces bornes limitent la mémoire et le temps de traitement : une archive très compressée ne peut pas devenir une bombe ZIP au moment de sa lecture. Elles ne rendent pas un fichier valide par elles-mêmes ; la validation de schéma et de contenu reste obligatoire après sélection.

## Garanties de persistance et de confidentialité

- Aucun ZIP ni dossier n’est extrait de façon persistante ; les contenus utiles sont lus en mémoire, bornée par ce contrat.
- Aucun fichier temporaire, registre de dossier, permission permanente ou tâche de surveillance n’est créé.
- L’inspection ne copie jamais la SQLite active, son WAL ou son SHM.
- Les formats JSON/CSV restent les seuls artefacts portables ; le cache TMDB, les clés et les images binaires restent exclus.
- Un échec d’inspection est récupérable, explicite et sans écriture SQLite.

## Preuves automatisées attendues

Les tests natifs couvrent la lecture en mémoire du ZIP Film historique, les candidats CSV multiples, les archives imbriquées, les limites de taille, de volume, de profondeur et de nombre d’entrées, ainsi que le refus des chemins non sûrs, archives chiffrées et liens symboliques. Le jalon `0.4.18` ajoutera les fixtures JSON/CSV génériques et les preuves spécifiques au dossier choisi.