-- Alpha7: partidas, sets, rallies e ações técnicas (0.5.0). MIGRAÇÃO ADITIVA: só cria objetos novos; não altera
-- nem apaga nada do que já existe.
--
-- Decisões:
-- * Mesmo padrão do restante: tudo pertence a uma equipe, chave (team_id, id), chaves estrangeiras com team_id.
-- * O PLACAR NUNCA É GRAVADO: é sempre a contagem dos rallies ativos. Assim ele não pode divergir do histórico.
-- * Sets, rallies e ações técnicas NÃO aceitam gravação direta pelas tabelas (só SELECT para os usuários): a escrita
--   passa pelas funções abaixo, que são transacionais, travam a partida e aplicam as regras de pontuação, saque e
--   rotação (as mesmas de src/domain/match.ts). Saque, rotação e sacador são calculados AQUI, nunca aceitos do cliente.
-- * Rally desfeito é ANULADO (voided_at), não apagado; o número (seq) dele é liberado para o próximo rally.
-- * O papel decide dentro de cada função (private.can_record / private.is_coach); a RLS protege as leituras e a
--   tabela matches.

-- ───────────── tabelas ─────────────
create table public.matches (
  team_id uuid not null references public.teams (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  opponent text not null check (char_length(opponent) between 2 and 80),
  competition text not null default '' check (char_length(competition) <= 120),
  -- Texto "AAAA-MM-DDTHH:mm" (campo datetime-local) ou vazio, como nas escalações: não inventa fuso.
  scheduled_at text not null default '' check (scheduled_at = '' or scheduled_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  venue text not null default '' check (char_length(venue) <= 120),
  lineup_id text,
  best_of smallint not null default 5 check (best_of in (1, 3, 5)),
  set_points smallint not null default 25 check (set_points between 1 and 99),
  deciding_set_points smallint not null default 15 check (deciding_set_points between 1 and 99),
  min_lead smallint not null default 2 check (min_lead between 1 and 10),
  status text not null default 'agendada' check (status in ('agendada', 'em_andamento', 'concluida')),
  final_sets_us smallint check (final_sets_us between 0 and 3),
  final_sets_them smallint check (final_sets_them between 0 and 3),
  concluded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (team_id, id),
  foreign key (team_id, lineup_id) references public.lineups (team_id, id) on delete set null (lineup_id),
  check ((final_sets_us is null) = (final_sets_them is null)),
  check ((status = 'concluida') = (final_sets_us is not null and concluded_at is not null))
);
create index matches_team_idx on public.matches (team_id, scheduled_at);

create table public.match_sets (
  team_id uuid not null,
  match_id text not null,
  number smallint not null check (number between 1 and 5),
  first_server text not null check (first_server in ('us', 'them')),
  libero_id text,
  created_at timestamptz not null,
  primary key (team_id, match_id, number),
  foreign key (team_id, match_id) references public.matches (team_id, id) on delete cascade,
  foreign key (team_id, libero_id) references public.players (team_id, id)
);
create index match_sets_libero_idx on public.match_sets (team_id, libero_id) where libero_id is not null;

-- Formação inicial do set: slot 0 = P1 ... 5 = P6.
create table public.match_set_starters (
  team_id uuid not null,
  match_id text not null,
  set_number smallint not null,
  slot smallint not null check (slot between 0 and 5),
  player_id text not null,
  role text not null check (role in ('levantador', 'oposto', 'ponteiro', 'central')),
  primary key (team_id, match_id, set_number, slot),
  unique (team_id, match_id, set_number, player_id),
  foreign key (team_id, match_id, set_number) references public.match_sets (team_id, match_id, number) on delete cascade,
  foreign key (team_id, player_id) references public.players (team_id, id)
);
create index match_set_starters_player_idx on public.match_set_starters (team_id, player_id);

create table public.rallies (
  team_id uuid not null,
  id text not null check (char_length(id) between 1 and 80),
  match_id text not null,
  set_number smallint not null,
  seq integer not null check (seq >= 1),
  serving_side text not null check (serving_side in ('us', 'them')),
  winner_side text not null check (winner_side in ('us', 'them')),
  rotation smallint not null check (rotation >= 0),
  server_player_id text,
  reason text check (reason in ('ace', 'ataque', 'bloqueio', 'erro_saque', 'erro_ataque', 'erro_recepcao', 'erro_outro', 'outro')),
  player_id text,
  attempt_key text not null check (char_length(attempt_key) between 1 and 200),
  recorded_at timestamptz not null,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  primary key (team_id, id),
  unique (team_id, match_id, id), -- permite a chave composta "ação do MESMO jogo" abaixo
  unique (team_id, attempt_key), -- idempotência: o mesmo toque nunca vira dois rallies
  foreign key (team_id, match_id, set_number) references public.match_sets (team_id, match_id, number) on delete cascade,
  foreign key (team_id, server_player_id) references public.players (team_id, id),
  foreign key (team_id, player_id) references public.players (team_id, id)
);
-- Dois rallies ATIVOS nunca ocupam o mesmo lugar do set (rede de segurança contra gravação concorrente).
create unique index rallies_active_seq_idx on public.rallies (team_id, match_id, set_number, seq) where voided_at is null;
create index rallies_match_idx on public.rallies (team_id, match_id, set_number, seq);
create index rallies_player_idx on public.rallies (team_id, player_id) where player_id is not null;
create index rallies_server_idx on public.rallies (team_id, server_player_id) where server_player_id is not null;
create index rallies_voided_by_idx on public.rallies (voided_by) where voided_by is not null;

-- Ação técnica: um fundamento observado de um atleta do Alpha7, ligado a um rally. Mesma taxonomia dos treinos.
create table public.rally_actions (
  team_id uuid not null,
  id text not null check (char_length(id) between 1 and 80),
  match_id text not null,
  rally_id text not null,
  player_id text not null,
  fundamental text not null check (fundamental in ('saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa')),
  outcome text not null,
  attempt_key text not null check (char_length(attempt_key) between 1 and 200),
  recorded_at timestamptz not null,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  primary key (team_id, id),
  unique (team_id, attempt_key),
  check (
    (fundamental = 'saque' and outcome in ('ace', 'valido', 'erro')) or
    (fundamental = 'recepcao' and outcome in ('A', 'B', 'C', 'erro')) or
    (fundamental = 'levantamento' and outcome in ('excelente', 'atacavel', 'quebrado', 'erro')) or
    (fundamental = 'ataque' and outcome in ('ponto', 'erro', 'bloqueado', 'outra')) or
    (fundamental = 'bloqueio' and outcome in ('ponto', 'sem_ponto', 'erro')) or
    (fundamental = 'defesa' and outcome in ('positiva', 'recuperada', 'erro'))
  ),
  foreign key (team_id, match_id, rally_id) references public.rallies (team_id, match_id, id) on delete cascade,
  foreign key (team_id, player_id) references public.players (team_id, id)
);
create index rally_actions_rally_idx on public.rally_actions (team_id, rally_id);
create index rally_actions_match_idx on public.rally_actions (team_id, match_id);
create index rally_actions_player_idx on public.rally_actions (team_id, player_id);
create index rally_actions_voided_by_idx on public.rally_actions (voided_by) where voided_by is not null;

-- ───────────── regras que as chaves não expressam ─────────────
-- Rally e ação técnica nunca são editados: só anulados, e a anulação não se desfaz.
create function private.rallies_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.team_id, new.id, new.match_id, new.set_number, new.seq, new.serving_side, new.winner_side, new.rotation,
      new.server_player_id, new.reason, new.player_id, new.attempt_key, new.recorded_at)
     is distinct from
     (old.team_id, old.id, old.match_id, old.set_number, old.seq, old.serving_side, old.winner_side, old.rotation,
      old.server_player_id, old.reason, old.player_id, old.attempt_key, old.recorded_at) then
    raise exception 'Rallies não podem ser editados; só desfeitos.' using errcode = '23514';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Um rally desfeito não pode ser reativado.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger rallies_append_only before update on public.rallies for each row execute function private.rallies_append_only();

create function private.rally_actions_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.team_id, new.id, new.match_id, new.rally_id, new.player_id, new.fundamental, new.outcome, new.attempt_key, new.recorded_at)
     is distinct from
     (old.team_id, old.id, old.match_id, old.rally_id, old.player_id, old.fundamental, old.outcome, old.attempt_key, old.recorded_at) then
    raise exception 'Ações técnicas não podem ser editadas; só desfeitas.' using errcode = '23514';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Uma ação desfeita não pode ser reativada.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger rally_actions_append_only before update on public.rally_actions for each row execute function private.rally_actions_append_only();

-- O formato (sets e pontos) não muda depois que o primeiro set foi iniciado: mudaria o significado do placar.
create function private.matches_lock_format() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.best_of, new.set_points, new.deciding_set_points, new.min_lead)
     is distinct from (old.best_of, old.set_points, old.deciding_set_points, old.min_lead)
     and exists (select 1 from public.match_sets s where s.team_id = old.team_id and s.match_id = old.id) then
    raise exception 'O formato não pode mudar depois que o primeiro set foi iniciado.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger matches_lock_format before update on public.matches for each row execute function private.matches_lock_format();

-- ───────────── funções auxiliares de pontuação (puras, espelham src/domain/match.ts) ─────────────
-- Set decisivo = o último do formato, quando há mais de um set.
create function private.set_target(p_best_of int, p_set int, p_set_points int, p_deciding int) returns int
language sql immutable set search_path = ''
as $$ select case when p_best_of > 1 and p_set = p_best_of then p_deciding else p_set_points end $$;

-- Não basta a pontuação nominal: precisa da diferença mínima. Sem teto.
create function private.set_winner(p_us int, p_them int, p_target int, p_lead int) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_us >= p_target and p_us - p_them >= p_lead then 'us'
    when p_them >= p_target and p_them - p_us >= p_lead then 'them'
    else null
  end
$$;

-- Sets ganhos por cada lado e situação do último set (usa só rallies ATIVOS).
create function private.match_progress(p_team uuid, p_match text, out sets_us int, out sets_them int, out last_set int, out last_winner text)
language plpgsql set search_path = ''
as $$
declare
  m public.matches;
  s record;
  v_us int;
  v_them int;
  v_winner text;
begin
  select * into m from public.matches where team_id = p_team and id = p_match;
  sets_us := 0;
  sets_them := 0;
  last_set := null;
  last_winner := null;
  for s in select ms.number from public.match_sets ms where ms.team_id = p_team and ms.match_id = p_match order by ms.number loop
    select count(*) filter (where r.winner_side = 'us'), count(*) filter (where r.winner_side = 'them')
      into v_us, v_them
      from public.rallies r
      where r.team_id = p_team and r.match_id = p_match and r.set_number = s.number and r.voided_at is null;
    v_winner := private.set_winner(v_us, v_them, private.set_target(m.best_of, s.number, m.set_points, m.deciding_set_points), m.min_lead);
    if v_winner = 'us' then sets_us := sets_us + 1; elsif v_winner = 'them' then sets_them := sets_them + 1; end if;
    last_set := s.number;
    last_winner := v_winner;
  end loop;
end;
$$;

-- ───────────── funções de escrita (transacionais; SECURITY DEFINER com checagem de papel por dentro) ─────────────
create function public.start_set(p_team uuid, p_match text, p_set jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  prog record;
  v_number int := (p_set->>'number')::int;
  v_next int;
  v_first text := p_set->>'first_server';
  v_libero text := nullif(p_set->>'libero_id', '');
  v_needed int;
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into m from public.matches where team_id = p_team and id = p_match for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;
  if m.status = 'concluida' then raise exception 'A partida está concluída.'; end if;

  select * into prog from private.match_progress(p_team, p_match);
  v_next := coalesce(prog.last_set, 0) + 1;
  v_needed := (m.best_of + 1) / 2;
  if prog.last_set is not null and prog.last_winner is null then
    raise exception 'Termine o set em andamento antes de iniciar outro.' using errcode = '40001';
  end if;
  if prog.sets_us >= v_needed or prog.sets_them >= v_needed then
    raise exception 'A partida já está decidida pelo formato: não há próximo set.';
  end if;
  if v_next > m.best_of then raise exception 'O formato não admite mais sets.'; end if;
  if v_number is distinct from v_next then
    raise exception 'O próximo set é o %.', v_next using errcode = '40001';
  end if;
  if v_first is null or v_first not in ('us', 'them') then raise exception 'Informe quem saca primeiro.'; end if;
  if jsonb_typeof(p_set->'starters') is distinct from 'array' or jsonb_array_length(p_set->'starters') <> 6 then
    raise exception 'A formação inicial precisa de seis titulares.';
  end if;
  if v_libero is not null and exists (
    select 1 from jsonb_array_elements(p_set->'starters') e where e->>'player_id' = v_libero
  ) then
    raise exception 'O líbero deve ser um atleta do elenco fora dos seis titulares.';
  end if;

  insert into public.match_sets (team_id, match_id, number, first_server, libero_id, created_at)
    values (p_team, p_match, v_number, v_first, v_libero, coalesce((p_set->>'created_at')::timestamptz, now()));
  insert into public.match_set_starters (team_id, match_id, set_number, slot, player_id, role)
    select p_team, p_match, v_number, (e->>'slot')::smallint, e->>'player_id', e->>'role'
    from jsonb_array_elements(p_set->'starters') e;

  update public.matches set status = 'em_andamento', updated_at = now()
    where team_id = p_team and id = p_match and status = 'agendada';
end;
$$;

create function public.record_rally(p_team uuid, p_match text, p_rally jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  r public.rallies;
  last_r public.rallies;
  v_key text := p_rally->>'attempt_key';
  v_set int := (p_rally->>'set_number')::int;
  v_cur int;
  v_us int;
  v_them int;
  v_seq int;
  v_serving text;
  v_rotation int;
  v_server text;
  v_winner text := p_rally->>'winner';
  v_reason text := nullif(p_rally->>'reason', '');
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into m from public.matches where team_id = p_team and id = p_match for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;

  -- Idempotência: o mesmo toque devolve o rally original, sem mudar nada (mesmo desfeito).
  select * into r from public.rallies where team_id = p_team and attempt_key = v_key;
  if found then
    return jsonb_build_object(
      'duplicate', true,
      'rally', to_jsonb(r),
      'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.recorded_at, a.id) from public.rally_actions a where a.team_id = p_team and a.rally_id = r.id), '[]'::jsonb)
    );
  end if;

  if m.status = 'concluida' then raise exception 'A partida está concluída. Reabra a partida para corrigir.'; end if;
  select max(number) into v_cur from public.match_sets where team_id = p_team and match_id = p_match;
  if v_cur is null or v_cur <> v_set then raise exception 'Este não é o set em andamento.' using errcode = '40001'; end if;

  select count(*) filter (where winner_side = 'us'), count(*) filter (where winner_side = 'them') into v_us, v_them
    from public.rallies where team_id = p_team and match_id = p_match and set_number = v_cur and voided_at is null;
  if private.set_winner(v_us, v_them, private.set_target(m.best_of, v_cur, m.set_points, m.deciding_set_points), m.min_lead) is not null then
    raise exception 'O set já está encerrado. Inicie o próximo set ou corrija o último ponto.';
  end if;

  -- Estado do próximo rally: SEMPRE calculado aqui (saque, rotação e sacador).
  select * into last_r from public.rallies
    where team_id = p_team and match_id = p_match and set_number = v_cur and voided_at is null
    order by seq desc limit 1;
  if found then
    v_seq := last_r.seq + 1;
    v_serving := last_r.winner_side;
    v_rotation := last_r.rotation + case when last_r.winner_side = 'us' and last_r.serving_side = 'them' then 1 else 0 end;
  else
    v_seq := 1;
    select first_server into v_serving from public.match_sets where team_id = p_team and match_id = p_match and number = v_cur;
    v_rotation := 0;
  end if;
  if (p_rally->>'expected_seq')::int is distinct from v_seq then
    raise exception 'Outra pessoa registrou um ponto neste meio-tempo. A tela foi atualizada.' using errcode = '40001';
  end if;

  if v_winner is null or v_winner not in ('us', 'them') then raise exception 'Informe quem ganhou o ponto.'; end if;
  if v_reason = 'ace' and v_winner <> v_serving then raise exception 'Ace só vale para quem estava sacando.'; end if;
  if v_reason = 'erro_saque' and v_winner = v_serving then raise exception 'Erro de saque só vale quando quem sacava perde o ponto.'; end if;
  if v_reason = 'erro_recepcao' and v_winner <> v_serving then raise exception 'Erro de recepção só vale quando quem recebia perde o ponto.'; end if;

  if v_serving = 'us' then
    select player_id into v_server from public.match_set_starters
      where team_id = p_team and match_id = p_match and set_number = v_cur and slot = v_rotation % 6;
  end if;

  insert into public.rallies (team_id, id, match_id, set_number, seq, serving_side, winner_side, rotation, server_player_id, reason, player_id, attempt_key, recorded_at)
    values (p_team, p_rally->>'id', p_match, v_cur, v_seq, v_serving, v_winner, v_rotation, v_server, v_reason,
            nullif(p_rally->>'player_id', ''), v_key, coalesce((p_rally->>'recorded_at')::timestamptz, now()))
    returning * into r;

  insert into public.rally_actions (team_id, id, match_id, rally_id, player_id, fundamental, outcome, attempt_key, recorded_at)
    select p_team, e->>'id', p_match, r.id, e->>'player_id', e->>'fundamental', e->>'outcome', e->>'attempt_key', r.recorded_at
    from jsonb_array_elements(coalesce(p_rally->'actions', '[]'::jsonb)) e;

  return jsonb_build_object(
    'duplicate', false,
    'rally', to_jsonb(r),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.recorded_at, a.id) from public.rally_actions a where a.team_id = p_team and a.rally_id = r.id), '[]'::jsonb)
  );
end;
$$;

-- Desfazer = anular o último rally ativo da partida (do set atual) e as ações dele. Reabre um set que tinha fechado.
create function public.void_last_rally(p_team uuid, p_match text, p_rally text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  v_cur int;
  last_r public.rallies;
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into m from public.matches where team_id = p_team and id = p_match for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;
  if m.status = 'concluida' then raise exception 'A partida está concluída. Reabra a partida para corrigir.'; end if;

  select max(number) into v_cur from public.match_sets where team_id = p_team and match_id = p_match;
  select * into last_r from public.rallies
    where team_id = p_team and match_id = p_match and set_number = v_cur and voided_at is null
    order by seq desc limit 1;
  if not found then raise exception 'Não há ponto para desfazer neste set.'; end if;
  if last_r.id <> p_rally then raise exception 'O último ponto mudou. A tela foi atualizada.' using errcode = '40001'; end if;

  update public.rallies set voided_at = now(), voided_by = (select auth.uid()) where team_id = p_team and id = last_r.id;
  update public.rally_actions set voided_at = now(), voided_by = (select auth.uid())
    where team_id = p_team and rally_id = last_r.id and voided_at is null;
end;
$$;

-- Desfaz o "iniciar set": só o último e só se nunca teve rally (nem desfeito).
create function public.cancel_empty_set(p_team uuid, p_match text, p_number int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  v_cur int;
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into m from public.matches where team_id = p_team and id = p_match for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;
  if m.status = 'concluida' then raise exception 'A partida está concluída.'; end if;
  select max(number) into v_cur from public.match_sets where team_id = p_team and match_id = p_match;
  if v_cur is distinct from p_number then raise exception 'Só o último set pode ser cancelado.' using errcode = '40001'; end if;
  if exists (select 1 from public.rallies where team_id = p_team and match_id = p_match and set_number = p_number) then
    raise exception 'Este set já tem registros (mesmo desfeitos) e não pode ser cancelado.';
  end if;
  delete from public.match_sets where team_id = p_team and match_id = p_match and number = p_number;
  if not exists (select 1 from public.match_sets where team_id = p_team and match_id = p_match) then
    update public.matches set status = 'agendada', updated_at = now() where team_id = p_team and id = p_match and status = 'em_andamento';
  end if;
end;
$$;

-- Encerra a partida: o resultado é recalculado aqui, dos sets FECHADOS pela regra de pontuação.
create function public.conclude_match(p_team uuid, p_match text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  prog record;
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into m from public.matches where team_id = p_team and id = p_match for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;
  if m.status = 'concluida' then raise exception 'A partida já está concluída.'; end if;
  select * into prog from private.match_progress(p_team, p_match);
  if prog.last_set is null then raise exception 'Inicie ao menos um set antes de encerrar a partida.'; end if;
  update public.matches
    set status = 'concluida', final_sets_us = prog.sets_us, final_sets_them = prog.sets_them, concluded_at = now(), updated_at = now()
    where team_id = p_team and id = p_match
    returning * into m;
  return to_jsonb(m);
end;
$$;

-- Reabrir uma partida concluída para corrigir: só a comissão técnica (coach).
create function public.reopen_match(p_team uuid, p_match text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
begin
  if not private.is_coach(p_team) then
    raise exception 'Só a comissão técnica pode reabrir uma partida concluída.' using errcode = '42501';
  end if;
  select * into m from public.matches where team_id = p_team and id = p_match for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'P0002'; end if;
  if m.status <> 'concluida' then raise exception 'A partida não está concluída.'; end if;
  update public.matches
    set status = 'em_andamento', final_sets_us = null, final_sets_them = null, concluded_at = null, updated_at = now()
    where team_id = p_team and id = p_match
    returning * into m;
  return to_jsonb(m);
end;
$$;

-- Acrescenta uma ação técnica a um rally JÁ registrado (rally ativo, partida não concluída).
create function public.add_rally_action(p_team uuid, p_action jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  r public.rallies;
  a public.rally_actions;
  v_key text := p_action->>'attempt_key';
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into r from public.rallies where team_id = p_team and id = p_action->>'rally_id';
  if not found then raise exception 'O rally desta ação não existe.' using errcode = 'P0002'; end if;
  select * into m from public.matches where team_id = p_team and id = r.match_id for update;
  select * into a from public.rally_actions where team_id = p_team and attempt_key = v_key;
  if found then return to_jsonb(a); end if; -- idempotente
  if m.status = 'concluida' then raise exception 'A partida está concluída. Reabra a partida para corrigir.'; end if;
  if r.voided_at is not null then raise exception 'Este rally foi desfeito.'; end if;
  insert into public.rally_actions (team_id, id, match_id, rally_id, player_id, fundamental, outcome, attempt_key, recorded_at)
    values (p_team, p_action->>'id', r.match_id, r.id, p_action->>'player_id', p_action->>'fundamental', p_action->>'outcome', v_key,
            coalesce((p_action->>'recorded_at')::timestamptz, now()))
    returning * into a;
  return to_jsonb(a);
end;
$$;

create function public.void_rally_action(p_team uuid, p_action text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.matches;
  a public.rally_actions;
begin
  if not private.can_record(p_team) then
    raise exception 'Seu papel na equipe não permite registrar partidas.' using errcode = '42501';
  end if;
  select * into a from public.rally_actions where team_id = p_team and id = p_action;
  if not found then raise exception 'A ação a desfazer não existe.' using errcode = 'P0002'; end if;
  select * into m from public.matches where team_id = p_team and id = a.match_id for update;
  if m.status = 'concluida' then raise exception 'A partida está concluída. Reabra a partida para corrigir.'; end if;
  update public.rally_actions set voided_at = coalesce(voided_at, now()), voided_by = coalesce(voided_by, (select auth.uid()))
    where team_id = p_team and id = p_action;
end;
$$;

-- ───────────── privilégios e RLS ─────────────
-- O Supabase concede tudo a authenticated por padrão: revoga e concede só o necessário.
revoke all on table public.matches, public.match_sets, public.match_set_starters, public.rallies, public.rally_actions
  from anon, public, authenticated;
grant select on public.matches, public.match_sets, public.match_set_starters, public.rallies, public.rally_actions to authenticated;
-- matches: cadastro e edição direta dos dados do jogo. Status e resultado só mudam pelas funções.
grant insert (team_id, id, opponent, competition, scheduled_at, venue, lineup_id, best_of, set_points, deciding_set_points, min_lead, created_at, updated_at)
  on public.matches to authenticated;
grant update (opponent, competition, scheduled_at, venue, lineup_id, best_of, set_points, deciding_set_points, min_lead, updated_at)
  on public.matches to authenticated;
grant delete on public.matches to authenticated;

alter table public.matches enable row level security;
alter table public.match_sets enable row level security;
alter table public.match_set_starters enable row level security;
alter table public.rallies enable row level security;
alter table public.rally_actions enable row level security;

create policy matches_select on public.matches for select to authenticated using (private.is_member(team_id));
create policy matches_insert on public.matches for insert to authenticated with check (private.can_record(team_id));
create policy matches_update on public.matches for update to authenticated
  using (private.can_record(team_id)) with check (private.can_record(team_id));
create policy matches_delete on public.matches for delete to authenticated using (private.is_coach(team_id));

create policy match_sets_select on public.match_sets for select to authenticated using (private.is_member(team_id));
create policy match_set_starters_select on public.match_set_starters for select to authenticated using (private.is_member(team_id));
create policy rallies_select on public.rallies for select to authenticated using (private.is_member(team_id));
create policy rally_actions_select on public.rally_actions for select to authenticated using (private.is_member(team_id));

revoke execute on function
  public.start_set(uuid, text, jsonb), public.record_rally(uuid, text, jsonb), public.void_last_rally(uuid, text, text),
  public.cancel_empty_set(uuid, text, int), public.conclude_match(uuid, text), public.reopen_match(uuid, text),
  public.add_rally_action(uuid, jsonb), public.void_rally_action(uuid, text)
  from public, anon;
grant execute on function
  public.start_set(uuid, text, jsonb), public.record_rally(uuid, text, jsonb), public.void_last_rally(uuid, text, text),
  public.cancel_empty_set(uuid, text, int), public.conclude_match(uuid, text), public.reopen_match(uuid, text),
  public.add_rally_action(uuid, jsonb), public.void_rally_action(uuid, text)
  to authenticated;
