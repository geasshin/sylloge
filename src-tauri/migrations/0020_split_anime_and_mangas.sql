-- Décision du 20 octobre 2026 : une bibliothèque = une table, dans l'unique
-- fichier sylloge.db. Séries / Animation japonaise et Livres / Mangas ne
-- partagent plus une table par catégorie : chacune a sa propre table.
--
-- La migration est additive d'abord : les nouvelles tables reçoivent une copie
-- des fiches concernées avec le MÊME identifiant, puis les lignes d'origine
-- sont retirées. Aucune donnée personnelle n'est transformée : statut, note,
-- coup de cœur, progression, dates, avis et citations sont recopiés tels quels.
-- Le retour en arrière s'appuie sur la sauvegarde prise avant migration.

-- ─── Animation japonaise : table dédiée, sans colonne de catégorie ───────────

CREATE TABLE IF NOT EXISTS anime (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  showrunner TEXT,
  casting TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'à voir'
    CHECK (status IN ('à voir', 'en cours', 'abandonnée', 'vue')),
  rating REAL
    CHECK (
      rating IS NULL
      OR (
        rating BETWEEN 0.5 AND 5.0
        AND rating * 2 = CAST(rating * 2 AS INTEGER)
      )
    ),
  is_favorite INTEGER NOT NULL DEFAULT 0
    CHECK (is_favorite IN (0, 1)),
  seasons_seen INTEGER
    CHECK (seasons_seen IS NULL OR seasons_seen >= 0),
  seasons_total INTEGER
    CHECK (seasons_total IS NULL OR seasons_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  poster_url TEXT,
  personal_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    seasons_seen IS NULL
    OR seasons_total IS NULL
    OR seasons_seen <= seasons_total
  ),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS anime_profile_id_idx ON anime(profile_id);

-- ─── Mangas : table dédiée et citations propres ─────────────────────────────

CREATE TABLE IF NOT EXISTS mangas (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  author TEXT,
  year INTEGER,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'à lire'
    CHECK (status IN ('à lire', 'en cours', 'abandonné', 'lu')),
  rating REAL
    CHECK (
      rating IS NULL
      OR (
        rating BETWEEN 0.5 AND 5.0
        AND rating * 2 = CAST(rating * 2 AS INTEGER)
      )
    ),
  is_favorite INTEGER NOT NULL DEFAULT 0
    CHECK (is_favorite IN (0, 1)),
  volumes_read INTEGER
    CHECK (volumes_read IS NULL OR volumes_read >= 0),
  volumes_total INTEGER
    CHECK (volumes_total IS NULL OR volumes_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  cover_url TEXT,
  personal_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    volumes_read IS NULL
    OR volumes_total IS NULL
    OR volumes_read <= volumes_total
  ),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS mangas_profile_id_idx ON mangas(profile_id);

CREATE TABLE IF NOT EXISTS manga_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  manga_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (manga_id) REFERENCES mangas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS manga_quotes_manga_id_idx ON manga_quotes(manga_id);

-- ─── Copie des fiches existantes, identifiants et champs inchangés ──────────

INSERT INTO anime (
  id, profile_id, title, showrunner, casting, summary, status, rating,
  is_favorite, seasons_seen, seasons_total, progress_updated_at, started_at,
  poster_url, personal_note, created_at, updated_at
)
SELECT
  id, profile_id, title, showrunner, casting, summary, status, rating,
  is_favorite, seasons_seen, seasons_total, progress_updated_at, started_at,
  poster_url, personal_note, created_at, updated_at
FROM series
WHERE category = 'animation';

INSERT INTO mangas (
  id, profile_id, title, author, year, summary, status, rating,
  is_favorite, volumes_read, volumes_total, progress_updated_at, started_at,
  cover_url, personal_note, created_at, updated_at
)
SELECT
  id, profile_id, title, author, year, summary, status, rating,
  is_favorite, volumes_read, volumes_total, progress_updated_at, started_at,
  cover_url, personal_note, created_at, updated_at
FROM books
WHERE category = 'manga';

INSERT OR IGNORE INTO manga_quotes (id, manga_id, body, position, created_at)
SELECT q.id, q.book_id, q.body, q.position, q.created_at
FROM book_quotes q
JOIN books b ON b.id = q.book_id
WHERE b.category = 'manga';

-- ─── Liens fournisseurs : le médium suit la fiche déplacée ─────────────────
-- Les déclencheurs de 0017 référencent media_provider_links : SQLite refuse de
-- renommer la table de remplacement tant qu'ils pointent vers un nom absent.
-- On les retire, on reconstruit la table, puis on les recrée plus bas.

DROP TRIGGER IF EXISTS delete_series_provider_link;
DROP TRIGGER IF EXISTS delete_book_provider_link;
DROP TRIGGER IF EXISTS delete_game_provider_link;

CREATE TABLE media_provider_links_new (
  profile_id TEXT NOT NULL,
  medium TEXT NOT NULL CHECK (medium IN ('series', 'anime', 'books', 'mangas', 'games')),
  media_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, medium, media_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO media_provider_links_new (
  profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
)
SELECT
  profile_id,
  CASE
    WHEN medium = 'series' AND media_id IN (SELECT id FROM anime) THEN 'anime'
    WHEN medium = 'books' AND media_id IN (SELECT id FROM mangas) THEN 'mangas'
    ELSE medium
  END,
  media_id, provider_name, provider_id, created_at, updated_at
FROM media_provider_links;

DROP TABLE media_provider_links;
ALTER TABLE media_provider_links_new RENAME TO media_provider_links;

CREATE INDEX IF NOT EXISTS idx_media_provider_links_media
  ON media_provider_links(medium, media_id);

-- Déclencheurs de suppression des liens, inchangés pour Séries, Livres, Jeux.
-- Ceux d'Animation et de Mangas sont créés en fin de migration.

CREATE TRIGGER IF NOT EXISTS delete_series_provider_link
AFTER DELETE ON series
BEGIN
  DELETE FROM media_provider_links
  WHERE profile_id = OLD.profile_id AND medium = 'series' AND media_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS delete_book_provider_link
AFTER DELETE ON books
BEGIN
  DELETE FROM media_provider_links
  WHERE profile_id = OLD.profile_id AND medium = 'books' AND media_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS delete_game_provider_link
AFTER DELETE ON games
BEGIN
  DELETE FROM media_provider_links
  WHERE profile_id = OLD.profile_id AND medium = 'games' AND media_id = OLD.id;
END;

-- ─── Vues enregistrées : même schéma v2, médium de la nouvelle bibliothèque ─

CREATE TABLE saved_views_new (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  medium TEXT NOT NULL
    CHECK (medium IN ('films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  criteria_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (profile_id, medium, name),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO saved_views_new (
  id, profile_id, medium, name, criteria_json, schema_version, created_at, updated_at
)
SELECT
  id,
  profile_id,
  CASE
    WHEN medium = 'series' AND json_extract(criteria_json, '$.mediumFilter') = 'animation' THEN 'anime'
    WHEN medium = 'books' AND json_extract(criteria_json, '$.mediumFilter') = 'manga' THEN 'mangas'
    ELSE medium
  END,
  name,
  CASE
    WHEN medium = 'series' AND json_extract(criteria_json, '$.mediumFilter') = 'animation'
      THEN json_set(criteria_json, '$.mediumFilter', 'all')
    WHEN medium = 'books' AND json_extract(criteria_json, '$.mediumFilter') = 'manga'
      THEN json_set(criteria_json, '$.mediumFilter', 'all')
    ELSE criteria_json
  END,
  schema_version, created_at, updated_at
FROM saved_views;

DROP TABLE saved_views;
ALTER TABLE saved_views_new RENAME TO saved_views;

-- ─── Retrait des lignes déplacées de leur ancienne table ───────────────────
-- Les déclencheurs AFTER DELETE de series/books suppriment les liens de
-- l'ancien médium ; les copies ont déjà été écrites sous 'anime' / 'mangas'.

DELETE FROM book_quotes
WHERE book_id IN (SELECT id FROM mangas);

DELETE FROM series WHERE category = 'animation';
DELETE FROM books WHERE category = 'manga';

-- ─── Déclencheurs de suppression des liens pour les nouvelles tables ───────

CREATE TRIGGER IF NOT EXISTS delete_anime_provider_link
AFTER DELETE ON anime
BEGIN
  DELETE FROM media_provider_links
  WHERE profile_id = OLD.profile_id AND medium = 'anime' AND media_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS delete_manga_provider_link
AFTER DELETE ON mangas
BEGIN
  DELETE FROM media_provider_links
  WHERE profile_id = OLD.profile_id AND medium = 'mangas' AND media_id = OLD.id;
END;
