-- 27 octobre 2026 : champs propres à chaque forme d'art.
-- Un poème porte son texte et son recueil, une peinture sa technique et ses
-- dimensions, une gravure son tirage. Comme pour les bibliothèques
-- personnalisées (0021), ces champs vivent dans un objet JSON « clé → texte »
-- (`details`) ; le catalogue des champs est côté application
-- (src/domain/artworkDetails.ts).
--
-- Ajout pur : aucune ligne existante n'est réécrite, chaque œuvre reçoit un
-- objet vide. Lieu, exposition et champs personnalisés restent à leur place.
ALTER TABLE artworks ADD COLUMN details TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(details) AND json_type(details) = 'object');
