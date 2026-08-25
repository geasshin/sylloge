CREATE TABLE IF NOT EXISTS media_provider_links (
  profile_id TEXT NOT NULL,
  medium TEXT NOT NULL CHECK (medium IN ('series', 'books', 'games')),
  media_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, medium, media_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_provider_links_media
  ON media_provider_links(medium, media_id);

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
