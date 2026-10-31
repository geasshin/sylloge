-- 31 octobre 2026 : recadrage vertical des bannières (décision d’Aurélien).
-- Une bannière est affichée dans un bandeau 3:1 : l’image remplit toute la
-- largeur et environ 40 % de sa hauteur reste cachée. `banner_position` dit
-- quelle partie de l’image se voit : un pourcentage vertical d’object-position,
-- 0 pour le haut de l’image, 50 pour le centre, 100 pour le bas.
--
-- Ajout pur : aucune ligne n’est réécrite, aucune valeur existante ne change.
-- NULL vaut centre, le comportement d’avant cette migration. Choisir une autre
-- image remet la position à NULL : une nouvelle image repart centrée.
-- Les livres et les autres bibliothèques ne sont pas concernés.
ALTER TABLE films ADD COLUMN banner_position INTEGER
  CHECK (banner_position IS NULL OR (banner_position BETWEEN 0 AND 100));
ALTER TABLE series ADD COLUMN banner_position INTEGER
  CHECK (banner_position IS NULL OR (banner_position BETWEEN 0 AND 100));
ALTER TABLE anime ADD COLUMN banner_position INTEGER
  CHECK (banner_position IS NULL OR (banner_position BETWEEN 0 AND 100));
ALTER TABLE games ADD COLUMN banner_position INTEGER
  CHECK (banner_position IS NULL OR (banner_position BETWEEN 0 AND 100));
