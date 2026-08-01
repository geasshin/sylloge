-- Jalon 0.4.23 : modèle unifié des vues. Une vue est un préset { filtres, tri }
-- entièrement porté par criteria_json (schéma v2) ; la colonne view, héritée du
-- modèle à deux concepts de 0.4.21, n'a plus de rôle. SQLite ne permet pas de
-- supprimer une colonne couverte par contrainte en place : on recrée la table.
-- Les critères persistés au schéma v1 sont convertis à la lecture par le
-- domaine, sans réécriture ici.

CREATE TABLE IF NOT EXISTS saved_views_new (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  medium TEXT NOT NULL
    CHECK (medium IN ('films', 'series', 'books', 'games', 'artworks')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  criteria_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (profile_id, medium, name),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO saved_views_new (id, profile_id, medium, name, criteria_json, schema_version, created_at, updated_at)
SELECT id, profile_id, medium, name, criteria_json, 2, created_at, updated_at FROM saved_views;

DROP TABLE saved_views;

ALTER TABLE saved_views_new RENAME TO saved_views;
