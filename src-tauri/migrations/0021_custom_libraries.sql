-- Décision du 22 octobre 2026 : bibliothèques personnalisées à partir de
-- modèles prêts. Huit modèles : Comics, Magazines, Livres audio, Musique,
-- Podcasts, Documentaires et reportages, Spectacles, Jeux de société.
--
-- Une bibliothèque = une table, comme les sept bibliothèques de base. Les
-- huit tables partagent la même structure ; les champs propres à chaque
-- modèle (éditeur, label, salle…) vivent dans la colonne JSON `details`.
-- Une bibliothèque n'existe pour un profil qu'une fois ajoutée : la table
-- `profile_libraries` en garde la liste et l'ordre.
--
-- Statuts stockés, communs aux huit tables : 'à découvrir', 'en cours',
-- 'terminé', 'abandonné'. Chaque modèle affiche ses propres libellés (« À
-- lire », « Écouté », « Vu »…) et peut n'en proposer qu'une partie.
--
-- Les comics quittent Livres : les fiches `books` de catégorie « comics »
-- sont copiées dans `comics` avec le même identifiant, citations comprises,
-- puis retirées de `books`. La bibliothèque Comics est ajoutée aux profils
-- concernés. Une copie de la base est prise avant cette migration.

CREATE TABLE IF NOT EXISTS profile_libraries (
  profile_id TEXT NOT NULL,
  library_id TEXT NOT NULL
    CHECK (library_id IN (
      'comics', 'magazines', 'audiobooks', 'music',
      'podcasts', 'documentaries', 'shows', 'board_games'
    )),
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (profile_id, library_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ─── Comics ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comics (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS comics_profile_id_idx ON comics(profile_id);

CREATE TABLE IF NOT EXISTS comic_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  comic_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS comic_quotes_comic_id_idx ON comic_quotes(comic_id);

-- ─── Magazines ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS magazines (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS magazines_profile_id_idx ON magazines(profile_id);

-- ─── Livres audio ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audiobooks (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS audiobooks_profile_id_idx ON audiobooks(profile_id);

-- ─── Musique ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS music (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS music_profile_id_idx ON music(profile_id);

-- ─── Podcasts ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS podcasts (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS podcasts_profile_id_idx ON podcasts(profile_id);

-- ─── Documentaires et reportages ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documentaries (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS documentaries_profile_id_idx ON documentaries(profile_id);

-- ─── Spectacles (théâtre compris) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS shows_profile_id_idx ON shows(profile_id);

-- ─── Jeux de société ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS board_games (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en cours', 'terminé', 'abandonné')),
  rating REAL
    CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  progress_current INTEGER CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0),
  progress_updated_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  cover_url TEXT,
  summary TEXT,
  personal_note TEXT,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS board_games_profile_id_idx ON board_games(profile_id);

-- ─── Les comics quittent Livres ────────────────────────────────────────────
-- Identifiants, dates, note, avis et citations recopiés tels quels. Statuts
-- de lecture traduits vers le vocabulaire commun ; les tomes lus deviennent
-- la progression.

INSERT INTO comics (
  id, profile_id, title, creator, year, status, rating, is_favorite,
  progress_current, progress_total, progress_updated_at, started_at,
  cover_url, summary, personal_note, details, created_at, updated_at
)
SELECT
  id, profile_id, title, author, year,
  CASE status
    WHEN 'à lire' THEN 'à découvrir'
    WHEN 'lu' THEN 'terminé'
    ELSE status
  END,
  rating, is_favorite, volumes_read, volumes_total, progress_updated_at,
  started_at, cover_url, summary, personal_note, '{}', created_at, updated_at
FROM books
WHERE category = 'comics';

INSERT OR IGNORE INTO comic_quotes (id, comic_id, body, position, created_at)
SELECT q.id, q.book_id, q.body, q.position, q.created_at
FROM book_quotes q
JOIN books b ON b.id = q.book_id
WHERE b.category = 'comics';

INSERT OR IGNORE INTO profile_libraries (profile_id, library_id, position)
SELECT DISTINCT profile_id, 'comics', 0
FROM books
WHERE category = 'comics';

DELETE FROM book_quotes
WHERE book_id IN (SELECT id FROM comics);

-- Le déclencheur AFTER DELETE de `books` retire les liens fournisseur des
-- fiches déplacées : les bibliothèques personnalisées n'ont pas de source.
DELETE FROM books WHERE category = 'comics';
