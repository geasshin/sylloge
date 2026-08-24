-- Jalon 0.6.12 : champs personnalisés de l'Art.
-- Une œuvre peut porter des métadonnées libres « nom → valeur » (exposition,
-- provenance, technique…) sans imposer de structure fermée. Stockage JSON
-- borné côté application : [{ name: string, value: string }, …].
-- Idempotent par nature (ajout de colonne si absente).
ALTER TABLE artworks ADD COLUMN custom_fields TEXT;
