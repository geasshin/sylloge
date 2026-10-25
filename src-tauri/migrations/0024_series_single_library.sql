-- Décision du 25 octobre 2026 : la bibliothèque Séries ne propose plus de
-- catégorie. « Animation japonaise » est une bibliothèque indépendante, avec
-- sa propre table `anime`. Toute fiche encore marquée `animation` dans
-- `series` redevient une série. La colonne `category` reste pour l'instant un
-- marqueur interne (une seule valeur possible pour les séries) ; sa suppression
-- physique demandera une reconstruction de table et une version du document
-- de portabilité, traitée séparément.

UPDATE series
SET category = 'série télé'
WHERE category <> 'série télé';
