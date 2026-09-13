-- A executer APRES "npm run auth:migrate" (qui cree la table "user" de Better Auth).
-- La contrainte ON DELETE CASCADE garantit que la suppression d'un compte
-- (droit a l'effacement RGPD) supprime aussi ses donnees de cycle, au
-- niveau de la base de donnees, sans dependre du code applicatif.

create table if not exists cycle_data (
  user_id text primary key references "user"(id) on delete cascade,
  periods jsonb not null default '[]',
  settings jsonb not null default '{"cycle":28,"period":5,"proj":3}',
  mode text not null default 'normal',
  preg_start_date date,
  updated_at timestamptz not null default now()
);
