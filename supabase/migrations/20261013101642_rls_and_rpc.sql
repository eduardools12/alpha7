-- Alpha7: segurança por equipe (RLS), permissões por papel e funções de entrada.
--
-- Papéis (team_members.role):
--   coach    comissão técnica: lê e escreve tudo da equipe, gerencia membros.
--   analyst  registra: acrescenta avaliações, cria/edita treinos e exercícios, registra e anula tentativas.
--   viewer   só leitura.
-- Quem não é membro não enxerga nada da equipe. O papel anon não acessa nenhuma tabela.
-- Avaliações e registros de treino nunca são apagados por usuários; registro só pode ser anulado.

-- ───────────── funções auxiliares (schema private: fora da API REST) ─────────────
-- SECURITY DEFINER para consultar team_members sem recursão de RLS; search_path vazio por segurança.
create function private.team_role(p_team uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select m.role from public.team_members m where m.team_id = p_team and m.user_id = (select auth.uid())
$$;

create function private.is_member(p_team uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.team_role(p_team) is not null $$;

create function private.is_coach(p_team uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce(private.team_role(p_team) = 'coach', false) $$;

-- coach ou analyst
create function private.can_record(p_team uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce(private.team_role(p_team) in ('coach', 'analyst'), false) $$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.team_role(uuid), private.is_member(uuid), private.is_coach(uuid), private.can_record(uuid) to authenticated;

-- ───────────── privilégios das tabelas ─────────────
revoke all on table
  public.teams, public.team_members, public.players, public.evaluations, public.overall_weights,
  public.lineups, public.lineup_starters, public.lineup_bench, public.trainings,
  public.training_participants, public.training_exercises, public.training_events
from anon, public;

grant select on public.teams to authenticated;
grant update (name) on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant update (role) on public.team_members to authenticated;
grant select, insert, update, delete on
  public.players, public.overall_weights, public.lineups, public.lineup_starters, public.lineup_bench,
  public.trainings, public.training_participants, public.training_exercises
to authenticated;
grant select, insert on public.evaluations to authenticated;                -- sem UPDATE/DELETE
grant select, insert on public.training_events to authenticated;
grant update (voided_at, voided_by) on public.training_events to authenticated; -- só anular

-- ───────────── RLS ─────────────
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.players enable row level security;
alter table public.evaluations enable row level security;
alter table public.overall_weights enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_starters enable row level security;
alter table public.lineup_bench enable row level security;
alter table public.trainings enable row level security;
alter table public.training_participants enable row level security;
alter table public.training_exercises enable row level security;
alter table public.training_events enable row level security;

-- equipes: criar só pela função create_team; excluir não é permitido
create policy teams_select on public.teams for select to authenticated using (private.is_member(id));
create policy teams_update on public.teams for update to authenticated
  using (private.is_coach(id)) with check (private.is_coach(id));

create policy members_select on public.team_members for select to authenticated using (private.is_member(team_id));
create policy members_insert on public.team_members for insert to authenticated with check (private.is_coach(team_id));
create policy members_update on public.team_members for update to authenticated
  using (private.is_coach(team_id)) with check (private.is_coach(team_id));
create policy members_delete on public.team_members for delete to authenticated using (private.is_coach(team_id));

-- escrita só da comissão técnica (coach): elenco, pesos, escalações
create policy players_select on public.players for select to authenticated using (private.is_member(team_id));
create policy players_insert on public.players for insert to authenticated with check (private.is_coach(team_id));
create policy players_update on public.players for update to authenticated
  using (private.is_coach(team_id)) with check (private.is_coach(team_id));
create policy players_delete on public.players for delete to authenticated using (private.is_coach(team_id));

create policy weights_select on public.overall_weights for select to authenticated using (private.is_member(team_id));
create policy weights_insert on public.overall_weights for insert to authenticated with check (private.is_coach(team_id));
create policy weights_update on public.overall_weights for update to authenticated
  using (private.is_coach(team_id)) with check (private.is_coach(team_id));
create policy weights_delete on public.overall_weights for delete to authenticated using (private.is_coach(team_id));

create policy lineups_select on public.lineups for select to authenticated using (private.is_member(team_id));
create policy lineups_insert on public.lineups for insert to authenticated with check (private.is_coach(team_id));
create policy lineups_update on public.lineups for update to authenticated
  using (private.is_coach(team_id)) with check (private.is_coach(team_id));
create policy lineups_delete on public.lineups for delete to authenticated using (private.is_coach(team_id));

create policy starters_select on public.lineup_starters for select to authenticated using (private.is_member(team_id));
create policy starters_insert on public.lineup_starters for insert to authenticated with check (private.is_coach(team_id));
create policy starters_update on public.lineup_starters for update to authenticated
  using (private.is_coach(team_id)) with check (private.is_coach(team_id));
create policy starters_delete on public.lineup_starters for delete to authenticated using (private.is_coach(team_id));

create policy bench_select on public.lineup_bench for select to authenticated using (private.is_member(team_id));
create policy bench_insert on public.lineup_bench for insert to authenticated with check (private.is_coach(team_id));
create policy bench_update on public.lineup_bench for update to authenticated
  using (private.is_coach(team_id)) with check (private.is_coach(team_id));
create policy bench_delete on public.lineup_bench for delete to authenticated using (private.is_coach(team_id));

-- avaliações: coach e analyst acrescentam; ninguém edita nem apaga
create policy evaluations_select on public.evaluations for select to authenticated using (private.is_member(team_id));
create policy evaluations_insert on public.evaluations for insert to authenticated with check (private.can_record(team_id));

-- treinos: coach e analyst criam/editam; só coach exclui (a exclusão leva exercícios e registros)
create policy trainings_select on public.trainings for select to authenticated using (private.is_member(team_id));
create policy trainings_insert on public.trainings for insert to authenticated with check (private.can_record(team_id));
create policy trainings_update on public.trainings for update to authenticated
  using (private.can_record(team_id)) with check (private.can_record(team_id));
create policy trainings_delete on public.trainings for delete to authenticated using (private.is_coach(team_id));

create policy participants_select on public.training_participants for select to authenticated using (private.is_member(team_id));
create policy participants_insert on public.training_participants for insert to authenticated with check (private.can_record(team_id));
create policy participants_update on public.training_participants for update to authenticated
  using (private.can_record(team_id)) with check (private.can_record(team_id));
create policy participants_delete on public.training_participants for delete to authenticated using (private.can_record(team_id));

create policy exercises_select on public.training_exercises for select to authenticated using (private.is_member(team_id));
create policy exercises_insert on public.training_exercises for insert to authenticated with check (private.can_record(team_id));
create policy exercises_update on public.training_exercises for update to authenticated
  using (private.can_record(team_id)) with check (private.can_record(team_id));
create policy exercises_delete on public.training_exercises for delete to authenticated using (private.can_record(team_id));

-- registros: acrescentar e anular; sem exclusão por usuário
create policy events_select on public.training_events for select to authenticated using (private.is_member(team_id));
create policy events_insert on public.training_events for insert to authenticated with check (private.can_record(team_id));
create policy events_update on public.training_events for update to authenticated
  using (private.can_record(team_id)) with check (private.can_record(team_id));

-- ───────────── funções de entrada (API) ─────────────
-- Criar equipe: quem cria vira coach. Exige login.
create function public.create_team(p_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_team uuid;
begin
  if v_user is null then
    raise exception 'Entre com seu e-mail para criar uma equipe.' using errcode = '28000';
  end if;
  insert into public.teams (name) values (btrim(p_name)) returning id into v_team;
  insert into public.team_members (team_id, user_id, role) values (v_team, v_user, 'coach');
  return v_team;
end;
$$;

-- Adicionar (ou mudar o papel de) uma pessoa que já entrou no Alpha7 pelo menos uma vez. Só coach.
create function public.add_team_member(p_team uuid, p_email text, p_role text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if not private.is_coach(p_team) then
    raise exception 'Só a comissão técnica (coach) pode adicionar pessoas à equipe.' using errcode = '42501';
  end if;
  if p_role not in ('coach', 'analyst', 'viewer') then
    raise exception 'Papel inválido: use coach, analyst ou viewer.' using errcode = '22023';
  end if;
  select u.id into v_target from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_target is null then
    raise exception 'Essa pessoa ainda não entrou no Alpha7. Peça que ela faça login uma vez e tente de novo.' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id, role) values (p_team, v_target, p_role)
  on conflict (team_id, user_id) do update set role = excluded.role;
end;
$$;

revoke execute on function public.create_team(text), public.add_team_member(uuid, text, text) from public, anon;
grant execute on function public.create_team(text), public.add_team_member(uuid, text, text) to authenticated;
