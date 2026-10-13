# Modelo de dados

Duas partes: **(A)** o que existe hoje em código (TypeScript + localStorage) e **(B)** a proposta de banco PostgreSQL/Supabase, ainda **não implementada**.

## A. Estado atual (implementado)

Tipos em `src/domain/` e `src/data/types.ts`. Persistência por `DataGateway` (`src/data/gateway.ts`), implementada por `LocalStorageGateway` na chave `alpha7.workspace.v1` com `{ version: 1, players, evaluations, lineups, settings, activity }`. Ao abrir, os dados são validados; formato inválido gera `StorageCorruptedError` e uma cópia fica em `alpha7.workspace.v1.corrupt`.

| Entidade | Campos principais | Observações |
|---|---|---|
| `Player` | id, name, jerseyNumber (1 a 99, único), primaryPosition, secondaryPosition?, status (ativo/lesionado/transicao), uniform (white/purple), coachNotes, createdAt, updatedAt, demo | Só dados cadastrais. Sem notas nem estatísticas |
| `Evaluation` | id, playerId, evaluatedAt (AAAA-MM-DD), evaluator, note, attributes (9 notas de 1 a 99), createdAt, demo | **Somente acrescentada.** O Overall não é gravado: é calculado |
| `Lineup` | id, title, opponent, competition, scheduledAt, venue, formation (5-1/4-2/6-2), starters[6] (`{playerId, role}` ou null; índice 0 = P1), liberoId, benchIds[], createdAt, updatedAt, demo | Nenhum atleta aparece duas vezes (garantido pelo domínio e revalidado ao salvar) |
| `Settings` | weights: pesos do Overall por posição × atributo | Provisórios e editáveis |
| `ActivitySnapshot` | trainingsCount, matches{played,wins}, nextMatch, lastTraining | **Somente demonstração** (`demo: true`) enquanto treinos e partidas não existirem |

Relações: `Evaluation.playerId → Player.id` (1 atleta : N avaliações); `Lineup.starters/liberoId/benchIds → Player.id`.

Regras de integridade em código: camisa única entre atletas; atributos inteiros de 1 a 99; posição secundária ≠ principal; avaliação não pode ter data futura; escalação só salva com 6 titulares, sem repetição e com nome; escalação apontando para atleta inexistente é recusada.

Limitações: um só navegador, sem backup, sem multiusuário, sem fotos.

## B. Proposta para Supabase/PostgreSQL (planejado)

> **O SQL abaixo é uma proposta de projeto. Não foi executado em nenhum banco** nem validado contra o Postgres; revise e teste em um branch do Supabase antes de aplicar.

Princípios: todo dado pertence a uma **equipe** (`team_id`) para que a arquitetura não dependa do Alpha7; **RLS** em todas as tabelas, escopo por `team_members`; avaliações, tentativas e rallies **nunca são apagados nem editados**: correção = nova linha + marca de anulação; chaves de idempotência contra contagem em dobro; Overall continua calculado (visão ou cliente), não gravado.

```sql
-- Equipes e acesso
create table teams (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table team_members (
  team_id uuid references teams on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('coach','analyst','viewer')),
  primary key (team_id, user_id)
);

-- Elenco (dados cadastrais)
create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  jersey_number smallint not null check (jersey_number between 1 and 99),
  primary_position text not null check (primary_position in ('levantador','oposto','ponteiro','central','libero')),
  secondary_position text check (secondary_position in ('levantador','oposto','ponteiro','central','libero') and secondary_position <> primary_position),
  status text not null default 'ativo' check (status in ('ativo','lesionado','transicao')),
  uniform text not null default 'purple' check (uniform in ('white','purple')),
  coach_notes text not null default '' check (char_length(coach_notes) <= 500),
  photo_path text,                       -- Storage; opcional
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (team_id, jersey_number)
);

-- Avaliações técnicas (histórico acrescentado; sem UPDATE/DELETE por política)
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  evaluated_at date not null,
  evaluator text not null,
  note text not null default '',
  sac smallint not null check (sac between 1 and 99), rec smallint not null check (rec between 1 and 99),
  lev smallint not null check (lev between 1 and 99), ata smallint not null check (ata between 1 and 99),
  blq smallint not null check (blq between 1 and 99), def smallint not null check (def between 1 and 99),
  vel smallint not null check (vel between 1 and 99), imp smallint not null check (imp between 1 and 99),
  lei smallint not null check (lei between 1 and 99),
  created_at timestamptz default now()
);

-- Pesos do Overall (um registro por posição)
create table overall_weights (
  team_id uuid references teams on delete cascade,
  position text check (position in ('levantador','oposto','ponteiro','central','libero')),
  sac numeric not null default 0 check (sac between 0 and 100), rec numeric not null default 0 check (rec between 0 and 100),
  lev numeric not null default 0 check (lev between 0 and 100), ata numeric not null default 0 check (ata between 0 and 100),
  blq numeric not null default 0 check (blq between 0 and 100), def numeric not null default 0 check (def between 0 and 100),
  vel numeric not null default 0 check (vel between 0 and 100), imp numeric not null default 0 check (imp between 0 and 100),
  lei numeric not null default 0 check (lei between 0 and 100),
  primary key (team_id, position),
  check (sac+rec+lev+ata+blq+def+vel+imp+lei > 0)
);

-- Escalações
create table lineups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  title text not null, opponent text not null default '', competition text not null default '',
  scheduled_at timestamptz, venue text not null default '',
  formation text not null default '5-1' check (formation in ('5-1','4-2','6-2')),
  libero_id uuid references players,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table lineup_starters (
  lineup_id uuid references lineups on delete cascade,
  zone smallint check (zone between 1 and 6),            -- P1..P6 na rotação inicial; ordem de saque = zona
  player_id uuid not null references players,
  tactical_role text not null check (tactical_role in ('levantador','oposto','ponteiro','central')),
  primary key (lineup_id, zone),
  unique (lineup_id, player_id)                           -- ninguém duas vezes
);
create table lineup_bench (lineup_id uuid references lineups on delete cascade, player_id uuid references players, primary key (lineup_id, player_id));

-- Treinos
create table trainings (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references teams on delete cascade,
  held_on date not null, focus text not null default '', intensity text check (intensity in ('baixa','media','alta')), notes text not null default ''
);
create table training_exercises (
  id uuid primary key default gen_random_uuid(), training_id uuid not null references trainings on delete cascade,
  position smallint not null, name text not null, fundamental text check (fundamental in ('saque','recepcao','levantamento','ataque','bloqueio','defesa'))
);
create table training_attendance (
  training_id uuid references trainings on delete cascade, player_id uuid references players,
  present boolean not null, primary key (training_id, player_id)
);
-- Cada linha = UMA tentativa. attempt_key (gerada no cliente) impede contar duas vezes o mesmo toque.
create table training_actions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings on delete cascade,
  exercise_id uuid references training_exercises,
  player_id uuid not null references players,
  fundamental text not null check (fundamental in ('saque','recepcao','levantamento','ataque','bloqueio','defesa')),
  outcome text not null,                                  -- ex.: recepção: A/B/C/erro; saque: ace/valido/erro; ataque: ponto/erro/bloqueado/continuou
  attempt_key uuid not null unique,
  recorded_at timestamptz default now(),
  voided_at timestamptz, voided_by uuid references auth.users, void_reason text   -- "desfazer" e correções
);

-- Partidas
create table matches (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references teams on delete cascade,
  lineup_id uuid references lineups, opponent text not null, competition text not null default '',
  scheduled_at timestamptz, venue text not null default '',
  best_of smallint not null default 5 check (best_of in (3,5)),           -- formato da competição (a confirmar)
  set_points smallint not null default 25, deciding_set_points smallint not null default 15,
  status text not null default 'agendada' check (status in ('agendada','em_andamento','encerrada'))
);
create table match_sets (
  id uuid primary key default gen_random_uuid(), match_id uuid not null references matches on delete cascade,
  number smallint not null check (number between 1 and 5), target_points smallint not null,
  unique (match_id, number)                               -- cada set tem o próprio placar (derivado dos rallies)
);
create table rallies (
  id uuid primary key default gen_random_uuid(), set_id uuid not null references match_sets on delete cascade,
  number smallint not null,                               -- sequência dentro do set
  serving_side text not null check (serving_side in ('a7','adversario')),
  server_player_id uuid references players, rotation smallint check (rotation between 0 and 5),
  winner_side text not null check (winner_side in ('a7','adversario')),
  reason text,                                            -- null = motivo desconhecido (não é um motivo)
  recorded_at timestamptz default now(),
  voided_at timestamptz, voided_by uuid references auth.users, void_reason text,
  corrects_id uuid references rallies,                    -- aponta para o rally que esta linha corrige
  unique (set_id, number) deferrable initially deferred
);
-- Motivos distintos: ace, erro_de_saque, ponto_de_ataque, bloqueio, erro_de_ataque, erro_adversario, outro
create table rally_events (
  id uuid primary key default gen_random_uuid(), rally_id uuid not null references rallies on delete cascade,
  seq smallint not null, side text not null check (side in ('a7','adversario')),
  player_id uuid references players, fundamental text, outcome text
);
```

### Regras e RLS

- Política padrão: `using (team_id in (select team_id from team_members where user_id = auth.uid()))`. Tabelas filhas herdam via `exists` na tabela-pai.
- `evaluations`, `training_actions`, `rallies`, `rally_events`: permitir `insert` e `select`; **sem** `update`/`delete` (anulação por `voided_*`, correção por nova linha com `corrects_id`). Só `coach` anula.
- Estatísticas lêem somente linhas com `voided_at is null` (visões `valid_training_actions`, `valid_rallies`).
- Placar do set = contagem de rallies válidos por `winner_side`; validar fim de set contra `target_points` com diferença de 2 (configurável).
- Chaves: somente `anon` (publicável) no frontend; `service_role` nunca.
- Migração dos dados locais: exportar o JSON v1 e inserir em `players`, `evaluations`, `lineups*`; o contrato `DataGateway` isola a troca na aplicação.

### Diferenças entre A e B a decidir na implementação

`jersey_number` único por equipe contra camisa repetida entre temporadas; fotos no Storage; `evaluator` texto livre contra referência a `auth.users`; formato de competição (sets e pontos) a confirmar com o Alpha7.
