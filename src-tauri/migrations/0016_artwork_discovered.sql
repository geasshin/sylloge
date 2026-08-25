-- Jalon 0.6.17 : une œuvre présente dans la collection est découverte.
-- Depuis la suppression des statuts de l'interface (0.6.11), plus aucune
-- œuvre ne peut passer en « découverte » : la vue Récent (groupe « consommé »)
-- est structurellement vide. Cette migration aligne les données sur la règle
-- produit du brief 6.1 et renseigne la date de découverte absente au jour de
-- la migration pour un tri récence exploitable.
-- Idempotent : rejouer ne change rien.
UPDATE artworks SET status = 'découverte' WHERE status = 'à découvrir';
UPDATE artworks
SET discovered_at = substr(created_at, 1, 10)
WHERE discovered_at IS NULL;
