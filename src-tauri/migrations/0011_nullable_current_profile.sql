-- Jalon 0.4.4 : tout profil peut être supprimé, y compris le dernier et le
-- profil actuellement ouvert. La sélection courante doit donc pouvoir être
-- vide (retour à l'onboarding). SQLite ne permet pas de modifier une colonne
-- en place : on recrée la table sans le NOT NULL ni la clé étrangère directe.

CREATE TABLE IF NOT EXISTS current_profile_new (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  profile_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);

INSERT INTO current_profile_new (singleton, profile_id, updated_at)
SELECT singleton, profile_id, updated_at FROM current_profile;

DROP TABLE current_profile;

ALTER TABLE current_profile_new RENAME TO current_profile;
