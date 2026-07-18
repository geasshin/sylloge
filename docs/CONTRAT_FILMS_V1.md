# Contrat de compatibilité Films v1

**Statut :** normatif pour le jalon interne `0.3.4`. Il fixe la lecture des fixtures réellement couvertes : JSON Sylloge, CSV Sylloge, CSV générique et export Notion CSV avec pages Markdown. Le format JSON `sylloge-films` v1 et le CSV Sylloge Films v1 ne changent pas.

## Règles communes

- SQLite locale est la source de vérité. Chaque import validé crée un nouveau profil dans une transaction atomique.
- Une chaîne facultative vide exacte (`""`) devient `null`. Aucun caractère d'une chaîne non vide, y compris ses espaces, n'est retiré par cette canonisation.
- `providerName` et `providerId` forment une provenance atomique : deux chaînes non vides, ou `null` et `null`. Une moitié historique est effacée en paire, sans inventer la valeur manquante.
- `0` et `false` restent des valeurs. Les espaces internes restent inchangés. Il n'y a aucune normalisation linguistique ou éditoriale des textes conservés.
- Les exports historiques v1 restent réimportables. Leur seule transformation autorisée est cette canonisation non destructive : chaîne facultative vide vers `null`, provenance partielle vers `null` et `null`.

Les données d'auteur sont le suivi que la personne a saisi ou choisi : titre, statut, favori, note, date de visionnage et note personnelle. Les métadonnées éditoriales sont les titres alternatifs, année, réalisation, résumé, affiche et provenance fournisseur. L'absence reste `null`, jamais une valeur de remplacement.

## Matrice par champ Film

| Champ Film | Nature | JSON Sylloge v1 | CSV Sylloge v1 | CSV générique | Notion CSV + Markdown |
| --- | --- | --- | --- | --- | --- |
| `id`, `profileId` | Technique d'import | Conservés pour validation, puis transformés en nouveaux identifiants locaux. | Même règle que JSON. | Ignorés, des identifiants temporaires puis locaux sont créés. | Même règle que CSV générique. |
| `title` | Donnée d'auteur | Conservé. | Conservé. | Conservé depuis la colonne mappée, obligatoire. | Conservé depuis `Name` ou la colonne mappée, obligatoire. Le titre Markdown sert seulement à une association sûre de note. |
| `status` | Donnée d'auteur | Conservé parmi les statuts v1. | Conservé parmi les statuts v1. | Transformé depuis les libellés explicitement reconnus, sinon l'import est bloqué. | Même règle, par exemple `To Watch` vers `à découvrir`. |
| `isFavorite` | Donnée d'auteur | Conservé. | Conservé comme `true` ou `false`. | Transformé depuis les booléens reconnus. | Transformé, par exemple `Yes` vers `true`. |
| `rating` | Donnée d'auteur | Conservé de `0.5` à `5` par demi-points. | Conservé dans la même échelle. | Transformé seulement après échelle explicite ou déterminée sans ambiguïté. `/10` est divisé par deux. | Même règle. |
| `watchedAt` | Donnée d'auteur | Conservé au format `AAAA-MM-JJ`. | Conservé au même format. | Transformé depuis une date ISO, numérique non ambiguë ou française écrite. | Même règle. |
| `personalNote` | Donnée d'auteur | Conservée. | Conservée, y compris les retours à la ligne. | Conservée depuis la colonne mappée. | Conservée depuis une colonne mappée ou, exclusivement sur choix explicite, depuis la section Markdown `Notes` associée à un unique titre CSV dans la même table. |
| `originalTitle`, `year`, `director`, `summary` | Métadonnées éditoriales | Conservés comme métadonnées déjà locales. | Conservés. | Explicitement ignorés. | Explicitement ignorés. |
| `providerName`, `providerId` | Provenance éditoriale | Conservés seulement comme paire complète, sinon normalisés en `null` et `null`. | Même règle. | Explicitement ignorés. | Explicitement ignorés. |
| `posterUrl` | Métadonnée éditoriale | Conservée seulement comme URL déjà locale et valide. | Conservée seulement comme URL déjà locale et valide. | Explicitement ignorée, notamment les URL temporaires. | Explicitement ignorée, notamment les couvertures Notion temporaires. |
| `createdAt`, `updatedAt` | Technique d'import | Conservés dans le document pour validation, puis les dates locales d'import sont créées. | Même règle. | Transformés en date d'import locale. | Même règle. |

Les colonnes externes non listées, par exemple `Actors`, `Cinema`, révisionnage, distribution et références Markdown, sont explicitement ignorées. Elles ne peuvent pas être mappées vers un champ Film existant. Les pages Markdown sans association unique et explicite n'écrivent aucune note.

## Compatibilité vérifiable

La fixture JSON anonymisée et son CSV Sylloge exact constituent le couple de réimport complet. Les fixtures CSV générique et Notion prouvent le périmètre réduit au suivi personnel, la conversion `/10` vers `/5`, l'exclusion des métadonnées externes et la note Markdown sûre. `scripts/verify.mjs` couvre aussi les vides historiques, les provenances partielles, les paires complètes et l'absence d'écriture avant validation.

Le contrat de structure, d'échappement et d'en-tête du CSV est dans [CONTRAT_CSV_FILMS_V1.md](CONTRAT_CSV_FILMS_V1.md). Il complète ce document sans le remplacer.
