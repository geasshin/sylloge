UPDATE films
SET
  original_title = NULLIF(original_title, ''),
  watched_at = NULLIF(watched_at, ''),
  personal_note = NULLIF(personal_note, ''),
  director = NULLIF(director, ''),
  summary = NULLIF(summary, ''),
  poster_url = NULLIF(poster_url, ''),
  provider_name = CASE
    WHEN provider_name IS NULL OR provider_name = '' OR provider_id IS NULL OR provider_id = '' THEN NULL
    ELSE provider_name
  END,
  provider_id = CASE
    WHEN provider_name IS NULL OR provider_name = '' OR provider_id IS NULL OR provider_id = '' THEN NULL
    ELSE provider_id
  END
WHERE
  original_title = ''
  OR watched_at = ''
  OR personal_note = ''
  OR director = ''
  OR summary = ''
  OR poster_url = ''
  OR provider_name = ''
  OR provider_id = ''
  OR (provider_name IS NULL) <> (provider_id IS NULL);
