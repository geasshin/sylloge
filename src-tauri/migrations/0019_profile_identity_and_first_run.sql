-- Enrichit l’identité locale sans modifier le format portable Sylloge.
-- L’avatar est une image normalisée en data URL et bornée côté commande Rust.
ALTER TABLE profiles
ADD COLUMN avatar_data_url TEXT
CHECK (
  avatar_data_url IS NULL
  OR (
    length(avatar_data_url) BETWEEN 1 AND 400000
    AND avatar_data_url LIKE 'data:image/%;base64,%'
  )
);

-- Les anciennes installations initialisaient systématiquement un profil
-- technique « Default ». Il empêchait le vrai onboarding de s’afficher sur
-- une base neuve. On ne retire que ce profil s’il est l’unique profil et s’il
-- ne contient strictement aucune donnée ou préférence personnelle.
UPDATE current_profile
SET profile_id = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE singleton = 1
  AND profile_id = 'default'
  AND (SELECT COUNT(*) FROM profiles) = 1
  AND NOT EXISTS (SELECT 1 FROM films WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM series WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM books WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM games WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM artworks WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM saved_views WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM backup_settings WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM backup_snapshots WHERE profile_id = 'default');

DELETE FROM profiles
WHERE id = 'default'
  AND (SELECT COUNT(*) FROM profiles) = 1
  AND (SELECT profile_id FROM current_profile WHERE singleton = 1) IS NULL
  AND NOT EXISTS (SELECT 1 FROM films WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM series WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM books WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM games WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM artworks WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM saved_views WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM backup_settings WHERE profile_id = 'default')
  AND NOT EXISTS (SELECT 1 FROM backup_snapshots WHERE profile_id = 'default');
