# Modelo de dados

Duas partes: **(A)** o que o aplicativo usa hoje (TypeScript + localStorage) e **(B)** o banco PostgreSQL/Supabase. **O esquema do banco já existe** no projeto `alpha7` (fase 1) e a fonte da verdade são as migrações em [`supabase/migrations/`](../supabase/migrations) e o [`supabase/README.md`](../supabase/README.md); o **aplicativo ainda não usa o banco**.

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

### Backend remoto (0.4.0): domínio ↔ tabelas

`SupabaseGateway` implementa o mesmo contrato, operação por operação, contra as tabelas reais de `supabase/migrations/` (fonte da verdade; tipos em `src/data/supabase/database.types.ts`). Conversões em `src/data/supabase/mappers.ts`:

| Domínio | Tabela(s) | Observações |
|---|---|---|
| `Player` | `players` | `jerseyNumber` → `jersey_number`; camisa única por equipe |
| `Evaluation` | `evaluations` | `attributes` → colunas `sac, rec, lev, ata, blq, def, vel, imp, lei`; só acrescenta |
| `Settings.weights` | `overall_weights` | uma linha por posição; posição sem linha = pesos padrão; linha inválida = erro |
| `Lineup` | `lineups` + `lineup_starters` (slot 0 a 5) + `lineup_bench` (`sort_order`) | `scheduledAt` é texto; gravação em etapas (apaga e reinsere partes) |
| `Training` | `trainings` + `training_participants` | `date` → `held_on`; `participantIds` volta ordenado por id |
| `TrainingExercise` | `training_exercises` | `order` → `sort_order` |
| `TrainingEvent` | `training_events` | idempotente por `(team_id, attempt_key)`; anulação por `voided_at`/`voided_by` |
| `Workspace.activity` | (nenhuma) | sempre `null` no remoto |

Todas as consultas levam `team_id`; ids de texto preservados. Com `kind === 'remote'`, `replaceWorkspace`, `snapshotInfo`, `restoreSnapshot`, `exportRaw`, `recoveryCopies`, `subscribe` e `usage` não têm equivalente: devolvem vazio ou `RemoteOperationUnavailableError`, e a interface esconde esses recursos. Erros tipados novos em `gateway.ts`: `PermissionDeniedError`, `SessionExpiredError`, `RemoteUnavailableError`, `RemoteDataError`, `RemoteOperationUnavailableError`.

### Chaves do navegador e proteção dos dados (v0.3)

| Chave `localStorage` | Conteúdo | Observação |
|---|---|---|
| `alpha7.workspace.v1` | O workspace (`version: 1`) | A única fonte de verdade |
| `alpha7.workspace.v1.snapshot` | `{ savedAt, reason, previousRaw }`: texto exato do workspace **antes** da última substituição ou exclusão de treino | Uma só vaga. Alimenta "Desfazer última substituição" |
| `alpha7.workspace.v1.corrupt` | Cópia do texto ilegível, guardada na primeira leitura que falha | Não é sobrescrita pela recuperação |
| `alpha7.workspace.v1.seen` | Data ISO da primeira vez em que este navegador teve um workspace | Marca de uso anterior: se a chave principal sumir e a marca ficar, o app abre a **recuperação** em vez da escolha de primeira utilização. Gravada junto com a primeira gravação e ao abrir dados existentes |
| `alpha7.lastBackup.v1` | `{ at, fingerprint, filename }` do último backup exportado | Fica **fora** do workspace e **fora** do backup: é metadado da máquina, não dado da equipe |

`DataGateway` tem `kind` (`local` | `remote`) e ganhou `replaceWorkspace(workspace, reason)`, `snapshotInfo()`, `restoreSnapshot()`, `exportRaw()`, `recoveryCopies()`, `subscribe()` e `usage()`. **`load()` nunca cria dados**: sem workspace, falha com `WorkspaceMissingError` (`first-use` ou `lost`, conforme haja rastros de uso anterior) e dado ilegível falha com `StorageCorruptedError`; a interface decide o que fazer (ver DATA_SAFETY.md, seção 7). Gravar sem workspace é recusado (`IntegrityError`), nunca recria demonstração. Regras: toda substituição do workspace inteiro guarda antes a cópia de segurança e **aborta sem alterar nada** se não conseguir guardá-la; a troca é uma única chamada `setItem` (tudo ou nada); `deleteTraining` também guarda a cópia. O formato do arquivo de backup e as regras de importação estão em [DATA_SAFETY.md](DATA_SAFETY.md).

Limitações: um só navegador, sem multiusuário, sem fotos. **Os dados locais não estão sincronizados com a nuvem** e o limite do `localStorage` (cerca de 5 MB por site) restringe o volume de registros; cada gravação regrava o conjunto inteiro (adequado ao volume de uma equipe amadora, não ao backend definitivo). A proteção contra perda é o **backup em arquivo**: sem ele, limpar os dados do navegador apaga tudo.

## B. Supabase/PostgreSQL

> **Atenção: o SQL desta seção é a proposta ORIGINAL e está superado.** O esquema real difere dela em pontos importantes: ids em **texto** (os mesmos do app e dos backups) com chave `(team_id, id)` e chaves estrangeiras sempre com `team_id`; escalações normalizadas em `lineup_starters`/`lineup_bench`; `scheduled_at` da escalação como texto; tabela de registros chamada `training_events`; gatilhos de append-only; papéis `coach`/`analyst`/`viewer`. Consulte `supabase/migrations/`. O texto abaixo fica só como registro do raciocínio inicial.

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

## Partidas (0.5.0)

**No app** (`Workspace`, coleções aditivas e separadas dos treinos): `matches`, `matchSets` (formação inicial: 6 titulares com posição 0 a 5, líbero, quem saca primeiro), `rallies` (ponto: set, número, quem sacava, quem ganhou, rotação, sacador, motivo, atleta envolvido, `attemptKey`, `voidedAt`) e `rallyActions` (ação técnica ligada a um ponto e a um atleta, mesma taxonomia dos treinos). Não há campo `demo`: partidas só existem se a equipe as criou. Regras puras em `src/domain/match.ts`; aplicação ao workspace em `src/data/matchOps.ts`.

**No banco** (migração `20261013134608_matches.sql`, aditiva): `matches`, `match_sets`, `match_set_starters`, `rallies`, `rally_actions`, todas com `team_id` e chave `(team_id, id)` (sets: `(team_id, match_id, number)`).
- Status e resultado de `matches` **não são graváveis direto** (`concluida` ⇔ resultado + `concluded_at`); mudam só por `conclude_match`/`reopen_match`. O formato trava depois do primeiro set (gatilho).
- Sets, titulares, pontos e ações **não têm política de escrita**: só as funções `SECURITY DEFINER` gravam, travando a partida (`FOR UPDATE`), conferindo o papel (`can_record`; `reopen_match` só coach) e aplicando as regras de placar, saque e rotação: `start_set`, `record_rally` (ponto + ações numa transação; idempotente por `attempt_key`; `expected_seq` detecta tela atrasada, erro `40001`), `void_last_rally`, `cancel_empty_set`, `conclude_match`, `reopen_match`, `add_rally_action`, `void_rally_action`.
- Ponto e ação nunca são editados (gatilho): só anulados, e a anulação não se desfaz. Índice único parcial impede dois pontos ativos no mesmo lugar do set. Excluir partida leva sets, pontos e ações; excluir atleta com registro de partida é recusado.
- `matches_fk_indexes` (`20261013134700`) acrescenta dois índices apontados pelo advisor.

**Backup/importação:** as quatro coleções entram no corpo do backup **só quando existe alguma partida** (assim dados e backups anteriores mantêm o mesmo checksum e a mesma impressão digital) e são validadas estritamente: ids, vínculos, sets em sequência, numeração de pontos, saque/rotação/sacador conferidos pelas regras, nenhum ponto depois do set fechado, resultado final igual ao dos sets, chaves de tentativa sem repetição.

## Fotos dos atletas (0.6.0)

- **Banco** (migração `20261013191918_player_photos.sql`, aditiva): `players.photo_path` (texto opcional, deve começar por `{team_id}/`), bucket **privado** `player-photos` (1 MB, só JPEG/PNG/WebP) e políticas em `storage.objects` pela função `private.photo_team`: membros da equipe leem; só `coach` envia, troca e remove, e só na pasta da própria equipe. Arquivos em `{team_id}/{player_id}-{versão}.jpg` (a versão muda a cada envio).
- **No app:** `Player.photo?` guarda a referência: caminho do bucket (nuvem) ou data URL reduzida (modo local; teto de ~300 KB). É a única referência: carta, perfil, escalação e arte usam sempre a mesma. Fotos aparecem por URL assinada de 1 h (cache de ~50 min); a arte baixa a mesma foto como data URL para desenhar.
- **Recorte:** sempre 4:5, versão final 640 x 800 em JPEG (qualidade 0,86), calculada em `domain/photo.ts` e desenhada em canvas.
- **Backup (modo local):** a foto vai no campo `photo` do atleta (só aparece quando existe, para manter checksums anteriores). A importação aceita só data URL de imagem ou caminho da equipe.
