-- A executer une fois sur la base (apres 001), en plus de "npm run auth:migrate".
-- Numero de version incremente a chaque sauvegarde : permet de detecter qu'un
-- autre appareil a modifie les donnees entre-temps (reponse 409 de l'API)
-- au lieu d'ecraser silencieusement ses modifications.

alter table cycle_data add column if not exists version integer not null default 0;
