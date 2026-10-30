-- 30 octobre 2026 : bannière 16:9 des fiches (décision d’Aurélien).
-- Films, Séries, Animation japonaise et Jeux peuvent porter une image de fond
-- au format paysage, choisie parmi les visuels officiels du fournisseur ou
-- collée par la personne. Comme les affiches, une bannière est l’adresse
-- d’une image, jamais un fichier : la colonne ne garde que ce lien.
--
-- Ajout pur : aucune ligne n’est réécrite, aucune valeur existante ne change.
-- Sans choix, la colonne reste NULL et la fiche n’affiche aucun bandeau : il
-- n’existe pas de bannière par défaut. Les livres et les autres bibliothèques
-- ne sont pas concernés.
ALTER TABLE films ADD COLUMN banner_url TEXT;
ALTER TABLE series ADD COLUMN banner_url TEXT;
ALTER TABLE anime ADD COLUMN banner_url TEXT;
ALTER TABLE games ADD COLUMN banner_url TEXT;
