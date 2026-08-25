-- Jalon 0.6.11 : normalisation des statuts Jeux.
-- « En cours » et « Regardé » disparaissent au profit des trois états
-- définitifs (à jouer / joué / abandonné). Une partie en cours devient jouée
-- (état le plus proche d'un suivi réel) ; un let's play regardé aussi.
-- Idempotent : rejouer ne change rien.
UPDATE games SET status = 'joué', updated_at = updated_at WHERE status IN ('en cours', 'regardé');
