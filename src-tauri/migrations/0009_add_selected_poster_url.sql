-- Affiche choisie explicitement par l'utilisateur parmi les affiches TMDB.
-- NULL = utiliser l'affiche principale du cache. La valeur vit et meurt avec
-- l'association TMDB : elle n'est ni exportée ni conservée après purge.
ALTER TABLE film_tmdb_cache
  ADD COLUMN selected_poster_url TEXT;
