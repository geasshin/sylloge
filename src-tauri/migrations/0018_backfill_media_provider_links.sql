-- Reprend seulement les anciennes fiches dont l'URL d'image démontre le
-- fournisseur. Aucun champ éditorial n'est utilisé comme heuristique.
INSERT OR IGNORE INTO media_provider_links
  (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
SELECT profile_id, 'series', id, 'TMDB', 'legacy:' || id, created_at, updated_at
FROM series
WHERE poster_url LIKE 'https://image.tmdb.org/%';

INSERT OR IGNORE INTO media_provider_links
  (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
SELECT profile_id, 'books', id, 'Open Library', 'legacy:' || id, created_at, updated_at
FROM books
WHERE cover_url LIKE 'https://covers.openlibrary.org/%';

INSERT OR IGNORE INTO media_provider_links
  (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
SELECT profile_id, 'games', id, 'IGDB', 'legacy:' || id, created_at, updated_at
FROM games
WHERE cover_url LIKE 'https://images.igdb.com/%';
