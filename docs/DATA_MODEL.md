# Modelo de dados

Duas partes: **(A)** o que existe hoje em código (TypeScript + localStorage) e **(B)** a proposta de banco PostgreSQL/Supabase, ainda **não implementada**.

## A. Estado atual (implementado)

Tipos em `src/domain/` e `src/data/types.ts`. Persistência por `DataGateway` (`src/data/gateway.ts`), implementada por `LocalStorageGateway` na chave `alpha7.workspace.v1` com `{ version: 1, players, evaluations, lineups, settings, activity, trainings, exercises, trainingEvents }`. Ao abrir, os dados são validados; formato inválido gera `StorageCorruptedError` e uma cópia fica em `alpha7.workspace.v1.corrupt`. Os campos `trainings`, `exercises` e `trainingEvents` são **aditivos**: dados salvos antes do módulo de treinos (sem essas listas) continuam válidos e abrem com elas vazias; se existirem e estiverem malformadas, o dado é tratado como corrompido.

| Entidade | Campos principais | Observações |
|---|---|---|
| `Player` | id, name, jerseyNumber (1 a 99, único), primaryPosition, secondaryPosition?, status (ativo/lesionado/transicao), uniform (white/purple), coachNotes, createdAt, updatedAt, demo | Só dados cadastrais. Sem notas nem estatísticas |
| `Evaluation` | id, playerId, evaluatedAt (AAAA-MM-DD), evaluator, note, attributes (9 notas de 1 a 99), createdAt, demo | **Somente acrescentada.** O Overall não é gravado: é calculado |
| `Lineup` | id, title, opponent, competition, scheduledAt, venue, formation (5-1/4-2/6-2), starters[6] (`{playerId, role}` ou null; índice 0 = P1), liberoId, benchIds[], createdAt, updatedAt, demo | Nenhum atleta aparece duas vezes (garantido pelo domínio e revalidado ao salvar) |
| `Settings` | weights: pesos do Overall por posição × atributo | Provisórios e editáveis |
| `Training` | id, name, date (AAAA-MM-DD), durationMinutes?, description, notes (observações do responsável), responsible (texto livre), participantIds[], status (`aberto`/`concluido`), completedAt?, createdAt, updatedAt, demo | Identificação própria. Participantes vêm do elenco |
| `TrainingExercise` | id, trainingId, name, focus? (fundamento em foco, informativo), order, createdAt | Pertence a exatamente um treino |
| `TrainingEvent` | id, trainingId, exerciseId, playerId, fundamental, outcome, recordedAt (data e hora ISO), attemptKey, voidedAt?, demo | **Uma tentativa por evento.** `fundamental` + `outcome` formam um par validado (`FundamentalResult`). Nunca apagado individualmente: "desfazer" preenche `voidedAt` |
| `ActivitySnapshot` | matches{played,wins}, nextMatch | **Somente demonstração** (`demo: true`) enquanto partidas não existirem. Treinos **não** fazem mais parte dele: vêm dos registros reais |

Relações: `Evaluation.playerId → Player.id` (1 atleta : N avaliações); `Lineup.starters/liberoId/benchIds → Player.id`; `TrainingExercise.trainingId → Training.id`; `TrainingEvent.trainingId → Training.id`, `.exerciseId → TrainingExercise.id` (do **mesmo** treino) e `.playerId → Player.id` (que está em `Training.participantIds`).

**Eventos de treino e de partida são mundos separados.** `TrainingEvent` é uma coleção própria; a taxonomia de fundamentos e resultados (`src/domain/fundamentals.ts`) é compartilhada, de modo que os futuros `MatchEvent` reutilizem as mesmas definições sem se misturar com treinos. **Avaliações (notas) e eventos (estatísticas) também são separados**: registrar tentativas nunca altera `Evaluation`.

Regras de integridade em código: camisa única entre atletas; atributos inteiros de 1 a 99; posição secundária ≠ principal; avaliação não pode ter data futura; escalação só salva com 6 titulares, sem repetição e com nome; escalação apontando para atleta inexistente é recusada.

Integridade de treinos (aplicada no domínio **e** de novo no gateway, para que nenhuma tela consiga burlá-la):

- Um evento só é criado se o treino existe e está aberto, o exercício pertence a esse treino, o atleta existe e participa do treino, e o resultado é válido para o fundamento. Caso contrário: erro com mensagem clara e nada é gravado.
- **Idempotência por `attemptKey`:** repetir o mesmo envio devolve o evento original (não duplica, não regrava). A chave de um evento desfeito continua ocupada: o mesmo toque não "ressuscita".
- **Desfazer** anula um evento específico por id (`voidedAt`), é idempotente e preserva o histórico. Estatísticas usam só `voidedAt === null`.
- **Editar o treino** (nome, descrição, observações, data, duração, responsável, participantes, exercícios) nunca toca nos eventos. Não é possível remover um exercício que tem registros (válidos ou desfeitos) nem um participante com registros válidos; renomear é sempre permitido.
- **Excluir o treino** apaga, de forma atômica, o treino, seus exercícios e todos os seus eventos (válidos e desfeitos), e só eles. A tela informa as contagens antes de confirmar.
- Treino concluído não aceita novos registros até ser reaberto.

### Chaves do navegador e proteção dos dados (v0.3)

| Chave `localStorage` | Conteúdo | Observação |
|---|---|---|
| `alpha7.workspace.v1` | O workspace (`version: 1`) | A única fonte de verdade |
| `alpha7.workspace.v1.snapshot` | `{ savedAt, reason, previousRaw }`: texto exato do workspace **antes** da última substituição ou exclusão de treino | Uma só vaga. Alimenta "Desfazer última substituição" |
| `alpha7.workspace.v1.corrupt` | Cópia do texto ilegível, guardada na primeira leitura que falha | Não é sobrescrita pela recuperação |
| `alpha7.lastBackup.v1` | `{ at, fingerprint, filename }` do último backup exportado | Fica **fora** do workspace e **fora** do backup: é metadado da máquina, não dado da equipe |

`DataGateway` ganhou `replaceWorkspace(workspace, reason)`, `snapshotInfo()`, `restoreSnapshot()`, `exportRaw()`, `subscribe()` e `usage()`. Regras: toda substituição do workspace inteiro guarda antes a cópia de segurança e **aborta sem alterar nada** se não conseguir guardá-la; a troca é uma única chamada `setItem` (tudo ou nada); `deleteTraining` também guarda a cópia. O formato do arquivo de backup e as regras de importação estão em [DATA_SAFETY.md](DATA_SAFETY.md).

Limitações: um só navegador, sem multiusuário, sem fotos. **Os dados locais não estão sincronizados com a nuvem** e o limite do `localStorage` (cerca de 5 MB por site) restringe o volume de registros; cada gravação regrava o conjunto inteiro (adequado ao volume de uma equipe amadora, não ao backend definitivo). A proteção contra perda é o **backup em arquivo**: sem ele, limpar os dados do navegador apaga tudo.

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
-- Espelha o modelo implementado em src/domain/training.ts (nomes de coluna em snake_case).
create table trainings (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references teams on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  held_on date not null,
  duration_minutes smallint check (duration_minutes between 1 and 600),
  description text not null default '' check (char_length(description) <= 500),
  notes text not null default '' check (char_length(notes) <= 1000),
  responsible text not null default '' check (char_length(responsible) <= 60),   -- depois: references auth.users
  status text not null default 'aberto' check (status in ('aberto','concluido')),
  completed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table training_participants (
  training_id uuid references trainings on delete cascade, player_id uuid references players,
  primary key (training_id, player_id)
);
create table training_exercises (
  id uuid primary key default gen_random_uuid(), training_id uuid not null references trainings on delete cascade,
  position smallint not null, name text not null check (char_length(name) between 2 and 60),
  focus text check (focus in ('saque','recepcao','levantamento','ataque','bloqueio','defesa')),
  unique (id, training_id),                               -- permite a chave composta abaixo
  unique (training_id, name)
);
-- Cada linha = UMA tentativa (treino). Partidas terão outra tabela (rally_events): não se misturam.
create table training_actions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null,
  exercise_id uuid not null,
  player_id uuid not null,
  fundamental text not null check (fundamental in ('saque','recepcao','levantamento','ataque','bloqueio','defesa')),
  outcome text not null,
  -- resultado coerente com o fundamento (mutuamente exclusivos por fundamento)
  check (
    (fundamental = 'saque'        and outcome in ('ace','valido','erro')) or
    (fundamental = 'recepcao'     and outcome in ('A','B','C','erro')) or
    (fundamental = 'levantamento' and outcome in ('excelente','atacavel','quebrado','erro')) or
    (fundamental = 'ataque'       and outcome in ('ponto','erro','bloqueado','outra')) or
    (fundamental = 'bloqueio'     and outcome in ('ponto','sem_ponto','erro')) or
    (fundamental = 'defesa'       and outcome in ('positiva','recuperada','erro'))
  ),
  attempt_key text not null unique,                       -- idempotência: o mesmo toque nunca vira dois registros
  recorded_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid references auth.users, void_reason text,   -- "desfazer": anula, não apaga
  foreign key (exercise_id, training_id) references training_exercises (id, training_id),   -- exercício DO MESMO treino
  foreign key (training_id, player_id) references training_participants (training_id, player_id)   -- atleta participante
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
- Excluir um treino em cascata (`on delete cascade` em `training_exercises` e `training_participants`) exige tratar `training_actions` no mesmo comando (a chave composta impede apagar exercício com registros; a exclusão do treino deve apagar os registros antes, numa função/transação).
- `evaluations`, `training_actions`, `rallies`, `rally_events`: permitir `insert` e `select`; **sem** `update`/`delete` (anulação por `voided_*`, correção por nova linha com `corrects_id`). Só `coach` anula.
- Estatísticas lêem somente linhas com `voided_at is null` (visões `valid_training_actions`, `valid_rallies`).
- Placar do set = contagem de rallies válidos por `winner_side`; validar fim de set contra `target_points` com diferença de 2 (configurável).
- Chaves: somente `anon` (publicável) no frontend; `service_role` nunca.
- Migração dos dados locais: usar o **arquivo de backup** (`alpha7-backup`, formato 1; ver DATA_SAFETY.md) como fonte, pois já é validado, tem vínculos conferidos e checksum; inserir em `players`, `evaluations`, `lineups*`, `trainings*`, `training_actions`. O contrato `DataGateway` isola a troca na aplicação. **Preservar os `id` do backup** como chaves (ou mapeá-los 1:1) para manter os vínculos e as `attemptKey` (idempotência).

### Diferenças entre A e B a decidir na implementação

`jersey_number` único por equipe contra camisa repetida entre temporadas; fotos no Storage; `evaluator` texto livre contra referência a `auth.users`; formato de competição (sets e pontos) a confirmar com o Alpha7.
