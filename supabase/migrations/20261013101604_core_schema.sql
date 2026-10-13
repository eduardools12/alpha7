-- Alpha7 Volleyball Performance: esquema principal (fase 1 da migração do localStorage).
--
-- Decisões:
-- * Todo dado pertence a uma equipe (team_id). A chave primária é (team_id, id) e TODAS as chaves
--   estrangeiras levam team_id: um registro nunca aponta para outra equipe, mesmo por engano.
-- * Os ids continuam sendo TEXTO (ex.: "player_1b30...", "demo-p-08"): é o que o app e os arquivos de
--   backup já usam, então a importação preserva ids e vínculos 1:1. Ids de demonstração repetem entre
--   equipes, por isso o par (team_id, id).
-- * Avaliações e registros de treino nunca são apagados nem editados: avaliação só é acrescentada;
--   registro só pode ser anulado (voided_at), como no domínio.
-- * Nomes de colunas em snake_case espelham src/domain/*.ts. Limites de tamanho espelham as constantes
--   do domínio; o banco é a segunda linha de defesa, a primeira continua sendo o domínio.

create schema if not exists private;

-- ───────────── equipes e acesso ─────────────
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('coach', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- ───────────── elenco e avaliações ─────────────
create table public.players (
  team_id uuid not null references public.teams (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  name text not null check (char_length(name) between 2 and 60),
  jersey_number smallint not null check (jersey_number between 1 and 99),
  primary_position text not null check (primary_position in ('levantador', 'oposto', 'ponteiro', 'central', 'libero')),
  secondary_position text check (
    secondary_position in ('levantador', 'oposto', 'ponteiro', 'central', 'libero')
    and secondary_position <> primary_position
  ),
  status text not null default 'ativo' check (status in ('ativo', 'lesionado', 'transicao')),
  uniform text not null default 'purple' check (uniform in ('white', 'purple')),
  coach_notes text not null default '' check (char_length(coach_notes) <= 500),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  demo boolean not null default false,
  primary key (team_id, id),
  unique (team_id, jersey_number)
);

-- Avaliação técnica: somente acrescentada (sem UPDATE/DELETE por política). O Overall NÃO é gravado.
create table public.evaluations (
  team_id uuid not null,
  id text not null check (char_length(id) between 1 and 80),
  player_id text not null,
  evaluated_at date not null,
  evaluator text not null default '' check (char_length(evaluator) <= 500),
  note text not null default '' check (char_length(note) <= 2000),
  sac smallint not null check (sac between 1 and 99),
  rec smallint not null check (rec between 1 and 99),
  lev smallint not null check (lev between 1 and 99),
  ata smallint not null check (ata between 1 and 99),
  blq smallint not null check (blq between 1 and 99),
  def smallint not null check (def between 1 and 99),
  vel smallint not null check (vel between 1 and 99),
  imp smallint not null check (imp between 1 and 99),
  lei smallint not null check (lei between 1 and 99),
  created_at timestamptz not null,
  demo boolean not null default false,
  primary key (team_id, id),
  foreign key (team_id, player_id) references public.players (team_id, id) on delete cascade
);
create index evaluations_player_idx on public.evaluations (team_id, player_id, evaluated_at);

-- Pesos do Overall por posição (um registro por posição; ausência = pesos padrão do app).
create table public.overall_weights (
  team_id uuid not null references public.teams (id) on delete cascade,
  position text not null check (position in ('levantador', 'oposto', 'ponteiro', 'central', 'libero')),
  sac numeric not null check (sac between 0 and 100),
  rec numeric not null check (rec between 0 and 100),
  lev numeric not null check (lev between 0 and 100),
  ata numeric not null check (ata between 0 and 100),
  blq numeric not null check (blq between 0 and 100),
  def numeric not null check (def between 0 and 100),
  vel numeric not null check (vel between 0 and 100),
  imp numeric not null check (imp between 0 and 100),
  lei numeric not null check (lei between 0 and 100),
  primary key (team_id, position),
  check (sac + rec + lev + ata + blq + def + vel + imp + lei > 0)
);

-- ───────────── escalações ─────────────
create table public.lineups (
  team_id uuid not null references public.teams (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  title text not null check (char_length(title) between 1 and 500),
  opponent text not null default '' check (char_length(opponent) <= 500),
  competition text not null default '' check (char_length(competition) <= 500),
  -- Texto "AAAA-MM-DDTHH:mm" (campo datetime-local) ou vazio; guardado como texto para não inventar fuso.
  scheduled_at text not null default '' check (scheduled_at = '' or scheduled_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  venue text not null default '' check (char_length(venue) <= 500),
  formation text not null default '5-1' check (formation in ('5-1', '4-2', '6-2')),
  libero_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  demo boolean not null default false,
  primary key (team_id, id),
  foreign key (team_id, libero_id) references public.players (team_id, id)
);

-- Titulares: slot 0 = P1 ... 5 = P6. Ninguém aparece duas vezes entre os titulares.
create table public.lineup_starters (
  team_id uuid not null,
  lineup_id text not null,
  slot smallint not null check (slot between 0 and 5),
  player_id text not null,
  role text not null check (role in ('levantador', 'oposto', 'ponteiro', 'central')),
  primary key (team_id, lineup_id, slot),
  unique (team_id, lineup_id, player_id),
  foreign key (team_id, lineup_id) references public.lineups (team_id, id) on delete cascade,
  foreign key (team_id, player_id) references public.players (team_id, id)
);
create index lineup_starters_player_idx on public.lineup_starters (team_id, player_id);

create table public.lineup_bench (
  team_id uuid not null,
  lineup_id text not null,
  sort_order smallint not null check (sort_order >= 0),
  player_id text not null,
  primary key (team_id, lineup_id, sort_order),
  unique (team_id, lineup_id, player_id),
  foreign key (team_id, lineup_id) references public.lineups (team_id, id) on delete cascade,
  foreign key (team_id, player_id) references public.players (team_id, id)
);
create index lineup_bench_player_idx on public.lineup_bench (team_id, player_id);

-- ───────────── treinos ─────────────
create table public.trainings (
  team_id uuid not null references public.teams (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  name text not null check (char_length(name) between 2 and 80),
  held_on date not null,
  duration_minutes smallint check (duration_minutes between 1 and 600),
  description text not null default '' check (char_length(description) <= 500),
  notes text not null default '' check (char_length(notes) <= 1000),
  responsible text not null default '' check (char_length(responsible) <= 60),
  status text not null default 'aberto' check (status in ('aberto', 'concluido')),
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  demo boolean not null default false,
  primary key (team_id, id),
  check ((status = 'concluido') = (completed_at is not null))
);

create table public.training_participants (
  team_id uuid not null,
  training_id text not null,
  player_id text not null,
  primary key (team_id, training_id, player_id),
  foreign key (team_id, training_id) references public.trainings (team_id, id) on delete cascade,
  foreign key (team_id, player_id) references public.players (team_id, id)
);
create index training_participants_player_idx on public.training_participants (team_id, player_id);

create table public.training_exercises (
  team_id uuid not null,
  id text not null check (char_length(id) between 1 and 80),
  training_id text not null,
  name text not null check (char_length(name) between 2 and 60),
  focus text check (focus in ('saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa')),
  sort_order smallint not null check (sort_order >= 0),
  created_at timestamptz not null,
  primary key (team_id, id),
  unique (team_id, id, training_id), -- permite a chave composta "exercício DO MESMO treino" abaixo
  foreign key (team_id, training_id) references public.trainings (team_id, id) on delete cascade
);
create index training_exercises_training_idx on public.training_exercises (team_id, training_id, sort_order);

-- Uma linha = UMA tentativa. Registros de partida terão outra tabela: treino e partida não se misturam.
create table public.training_events (
  team_id uuid not null,
  id text not null check (char_length(id) between 1 and 80),
  training_id text not null,
  exercise_id text not null,
  player_id text not null,
  fundamental text not null check (fundamental in ('saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa')),
  outcome text not null,
  recorded_at timestamptz not null,
  attempt_key text not null check (char_length(attempt_key) between 1 and 200),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  demo boolean not null default false,
  primary key (team_id, id),
  unique (team_id, attempt_key), -- idempotência: o mesmo toque nunca vira dois registros
  -- resultado coerente com o fundamento (mutuamente exclusivos por fundamento)
  check (
    (fundamental = 'saque' and outcome in ('ace', 'valido', 'erro')) or
    (fundamental = 'recepcao' and outcome in ('A', 'B', 'C', 'erro')) or
    (fundamental = 'levantamento' and outcome in ('excelente', 'atacavel', 'quebrado', 'erro')) or
    (fundamental = 'ataque' and outcome in ('ponto', 'erro', 'bloqueado', 'outra')) or
    (fundamental = 'bloqueio' and outcome in ('ponto', 'sem_ponto', 'erro')) or
    (fundamental = 'defesa' and outcome in ('positiva', 'recuperada', 'erro'))
  ),
  -- Excluir o treino leva exercícios e registros junto (cascata, como deleteTraining). Excluir um
  -- exercício ou atleta que tem registros é recusado (NO ACTION), como no domínio.
  foreign key (team_id, training_id) references public.trainings (team_id, id) on delete cascade,
  foreign key (team_id, exercise_id, training_id) references public.training_exercises (team_id, id, training_id),
  foreign key (team_id, player_id) references public.players (team_id, id)
);
create index training_events_training_idx on public.training_events (team_id, training_id, recorded_at);
create index training_events_player_idx on public.training_events (team_id, player_id);
create index training_events_exercise_idx on public.training_events (team_id, exercise_id, training_id);

-- Regras que chaves estrangeiras não expressam ───────────────────────────────────────────────

-- Registro VÁLIDO (não anulado) exige que o atleta participe do treino. (Anulado pode ficar para trás
-- se o atleta sair da lista depois, igual ao domínio.) A regra inversa, "não remover da lista quem tem
-- registro válido", fica no domínio e no gateway.
create function private.check_event_participant() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.voided_at is null and not exists (
    select 1 from public.training_participants p
    where p.team_id = new.team_id and p.training_id = new.training_id and p.player_id = new.player_id
  ) then
    raise exception 'O atleta deste registro não participa do treino.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger training_events_participant
  before insert or update on public.training_events
  for each row execute function private.check_event_participant();

-- Registro só pode ser ANULADO: nenhum outro campo muda e a anulação não é desfeita.
create function private.training_events_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.team_id, new.id, new.training_id, new.exercise_id, new.player_id, new.fundamental, new.outcome,
      new.recorded_at, new.attempt_key, new.demo)
     is distinct from
     (old.team_id, old.id, old.training_id, old.exercise_id, old.player_id, old.fundamental, old.outcome,
      old.recorded_at, old.attempt_key, old.demo) then
    raise exception 'Registros de treino não podem ser editados; só anulados.' using errcode = '23514';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Um registro anulado não pode ser reativado nem ter a anulação alterada.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger training_events_append_only
  before update on public.training_events
  for each row execute function private.training_events_append_only();

-- Avaliações são acrescentadas, nunca editadas (a RLS também não dá UPDATE/DELETE; isto vale até para service_role).
create function private.evaluations_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Avaliações não podem ser editadas: registre uma nova avaliação.' using errcode = '23514';
end;
$$;
create trigger evaluations_no_update
  before update on public.evaluations
  for each row execute function private.evaluations_append_only();
