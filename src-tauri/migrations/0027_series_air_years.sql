-- 30 octobre 2026 : période de diffusion des séries et des animés.
-- TMDB publie first_air_date, last_air_date et in_production ; la fiche garde
-- les deux années, jamais les dates complètes : « 2017–2020 » pour une série
-- terminée, « 2022– » tant qu'elle continue, « 2017 » si tout tient dans une
-- année. C'est l'équivalent, pour une série, de l'année d'un film.
--
-- Ajout pur : aucune ligne n'est réécrite, aucune valeur existante ne change.
-- Sans données du fournisseur, les deux colonnes restent NULL et la fiche
-- n'affiche aucune période. Les bornes 1900–2100 écartent une saisie absurde
-- sans jamais refuser une année plausible.
ALTER TABLE series ADD COLUMN first_air_year INTEGER
  CHECK (first_air_year IS NULL OR first_air_year BETWEEN 1900 AND 2100);
ALTER TABLE series ADD COLUMN last_air_year INTEGER
  CHECK (last_air_year IS NULL OR last_air_year BETWEEN 1900 AND 2100);
ALTER TABLE anime ADD COLUMN first_air_year INTEGER
  CHECK (first_air_year IS NULL OR first_air_year BETWEEN 1900 AND 2100);
ALTER TABLE anime ADD COLUMN last_air_year INTEGER
  CHECK (last_air_year IS NULL OR last_air_year BETWEEN 1900 AND 2100);
