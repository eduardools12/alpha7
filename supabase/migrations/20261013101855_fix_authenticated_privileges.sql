-- Correção encontrada por supabase/tests/rls.test.sql: o Supabase concede, por padrão, TODOS os privilégios
-- das tabelas novas ao papel authenticated, e a migração anterior só revogou de anon/public. Por isso
-- "avaliação sem UPDATE/DELETE" e "registro só edita voided_at" dependiam apenas da RLS. Aqui o privilégio
-- passa a ser a primeira camada (RLS continua sendo a segunda).

revoke all on table
  public.teams, public.team_members, public.players, public.evaluations, public.overall_weights,
  public.lineups, public.lineup_starters, public.lineup_bench, public.trainings,
  public.training_participants, public.training_exercises, public.training_events
from authenticated;

grant select on public.teams to authenticated;
grant update (name) on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant update (role) on public.team_members to authenticated;
grant select, insert, update, delete on
  public.players, public.overall_weights, public.lineups, public.lineup_starters, public.lineup_bench,
  public.trainings, public.training_participants, public.training_exercises
to authenticated;
grant select, insert on public.evaluations to authenticated;                    -- sem UPDATE/DELETE
grant select, insert on public.training_events to authenticated;                -- sem DELETE
grant update (voided_at, voided_by) on public.training_events to authenticated; -- só anular
