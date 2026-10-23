-- Décision du 23 octobre 2026 : neuvième modèle prêt, « Recettes de cuisine ».
--
-- Une recette est une fiche de bibliothèque personnalisée comme les autres :
-- même table de structure commune, mêmes statuts stockés, champs propres dans
-- la colonne JSON `details`. Les ingrédients et la préparation y sont des
-- textes longs, enregistrés tels quels (retours à la ligne, lignes vides,
-- espaces et tabulations compris) ; la photo est l'adresse d'une image dans
-- `cover_url`, jamais un fichier copié dans la base.
--
-- La liste des modèles autorisés est une contrainte CHECK de `profile_libraries`.
-- SQLite ne modifie pas une contrainte : la table est reconstruite, ses lignes
-- copiées avec chacune de leurs colonnes (profil, bibliothèque, position, date
-- d'ajout), puis la table d'origine est supprimée en dernier. Rien ne dépend de
-- `profile_libraries` : ni déclencheur, ni clé étrangère entrante, ni index
-- nommé. Une copie de la base est prise avant toute migration.

CREATE TABLE profile_libraries_v22 (
  profile_id TEXT NOT NULL,
  library_id TEXT NOT NULL
    CHECK (library_id IN (
      'comics', 'magazines', 'audiobooks', 'music',
      'podcasts', 'documentaries', 'shows', 'board_games',
      'recipes'
    )),
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (profile_id, library_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO profile_libraries_v22 (profile_id, library_id, position, added_at)
SELECT profile_id, library_id, position, added_at FROM profile_libraries;

DROP TABLE profile_libraries;
ALTER TABLE profile_libraries_v22 RENAME TO profile_libraries;

-- ─── Recettes de cuisine ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recipes (
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
CREATE INDEX IF NOT EXISTS recipes_profile_id_idx ON recipes(profile_id);
