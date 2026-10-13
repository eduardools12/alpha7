-- Índices de chaves estrangeiras apontados pelo advisor de desempenho do Supabase.
create index lineups_libero_idx on public.lineups (team_id, libero_id) where libero_id is not null;
create index training_events_voided_by_idx on public.training_events (voided_by) where voided_by is not null;
