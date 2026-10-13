-- Índices de apoio às chaves estrangeiras das partidas (apontados pelo verificador de desempenho do Supabase).
create index matches_lineup_idx on public.matches (team_id, lineup_id) where lineup_id is not null;
create index rally_actions_rally_fk_idx on public.rally_actions (team_id, match_id, rally_id);
