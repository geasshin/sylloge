-- Décision du 24 octobre 2026 : une recette s'essaie (« À tester »), se teste
-- (« Testée ») puis se maîtrise (« Maîtrisée »). L'état « écartée » disparaît
-- des recettes ; « en cours » ne s'y applique pas.
--
-- SQLite ne modifie pas une contrainte CHECK : la table `recipes` est
-- reconstruite avec le statut supplémentaire `maîtrisée`. Ses lignes sont
-- copiées colonne par colonne, l'index est recréé, l'ancienne table est
-- supprimée en dernier. Rien ne dépend de `recipes` : ni déclencheur, ni clé
-- étrangère entrante, ni vue. Les huit autres tables gardent leurs quatre
-- statuts communs ; `maîtrisée` n'existe que dans celle-ci.
--
-- Le profil reste la seule clé étrangère. Une copie de la base est prise par
-- l'application avant toute migration.

CREATE TABLE recipes_v23 (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  creator TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'terminé', 'maîtrisée')),
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

-- Une ligne à « en cours » ou « abandonné » (état d'une recette créée avant ce
-- lot) rejoint « À tester » : c'est la seule lecture qui n'affirme rien de
-- faux sur ce qui a été cuisiné.
INSERT INTO recipes_v23 (
  id, profile_id, title, creator, year, status, rating, is_favorite,
  progress_current, progress_total, progress_updated_at, started_at,
  finished_at, cover_url, summary, personal_note, details, created_at, updated_at
)
SELECT
  id, profile_id, title, creator, year,
  CASE WHEN status IN ('à découvrir', 'terminé', 'maîtrisée') THEN status ELSE 'à découvrir' END,
  rating, is_favorite, progress_current, progress_total, progress_updated_at,
  started_at, finished_at, cover_url, summary, personal_note, details,
  created_at, updated_at
FROM recipes;

DROP TABLE recipes;
ALTER TABLE recipes_v23 RENAME TO recipes;
CREATE INDEX IF NOT EXISTS recipes_profile_id_idx ON recipes(profile_id);
