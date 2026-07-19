CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  showrunner TEXT,
  casting TEXT,
  summary TEXT,
  category TEXT NOT NULL DEFAULT 'série télé'
    CHECK (category IN ('série télé', 'animation')),
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

CREATE INDEX IF NOT EXISTS series_profile_id_idx ON series(profile_id);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  author TEXT,
  year INTEGER,
  summary TEXT,
  category TEXT NOT NULL DEFAULT 'livre'
    CHECK (category IN ('livre', 'manga', 'comics')),
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

CREATE INDEX IF NOT EXISTS books_profile_id_idx ON books(profile_id);

CREATE TABLE IF NOT EXISTS book_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS book_quotes_book_id_idx ON book_quotes(book_id);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  developer TEXT,
  platform TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à jouer'
    CHECK (status IN ('à jouer', 'en cours', 'joué', 'abandonné', 'regardé')),
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
  played_at TEXT,
  cover_url TEXT,
  personal_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS games_profile_id_idx ON games(profile_id);

CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  artist TEXT,
  year INTEGER,
  form TEXT NOT NULL DEFAULT 'autre'
    CHECK (form IN (
      'peinture', 'sculpture', 'photographie', 'dessin', 'poésie',
      'gravure', 'performance', 'art conceptuel', 'autre'
    )),
  location TEXT,
  exhibition TEXT,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'découverte')),
  is_favorite INTEGER NOT NULL DEFAULT 0
    CHECK (is_favorite IN (0, 1)),
  discovered_at TEXT,
  image_url TEXT,
  personal_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS artworks_profile_id_idx ON artworks(profile_id);
