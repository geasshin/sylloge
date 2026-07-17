INSERT INTO profiles (id, name)
VALUES ('default', 'Default')
ON CONFLICT(id) DO NOTHING;
