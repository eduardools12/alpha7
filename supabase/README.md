# Supabase do Alpha7

Banco e acesso do Alpha7 na nuvem. **Estado: fase 1 concluída (esquema, segurança e testes no banco). O aplicativo ainda usa `localStorage`**: não há login nem `SupabaseGateway` no código. Nenhum dado real foi enviado para o banco.

| Item | Valor |
|---|---|
| Projeto | `alpha7` (ref `jpvktlxuwdebvcbkzesk`), organização `eduardools12's Org`, região `sa-east-1` (São Paulo), plano gratuito (US$ 0/mês) |
| URL da API | `https://jpvktlxuwdebvcbkzesk.supabase.co` |
| Chave para o frontend | somente a **publishable** (`sb_publishable_…`), em `.env.local` (ignorado pelo Git). A `service_role` **nunca** vai ao frontend nem ao repositório |

## Migrações (`supabase/migrations/`, em ordem)

| Arquivo | O que faz |
|---|---|
| `20261013101604_core_schema.sql` | Tabelas, chaves, restrições e gatilhos. Tudo pertence a uma equipe: chave primária `(team_id, id)` e chaves estrangeiras sempre com `team_id` |
| `20261013101642_rls_and_rpc.sql` | Funções de papel (schema `private`), RLS, privilégios, `create_team` e `add_team_member` |
| `20261013101855_fix_authenticated_privileges.sql` | Correção achada pelos testes: revoga os privilégios padrão do Supabase para `authenticated` e concede só o necessário |
| `20261013102000_missing_fk_indexes.sql` | Índices de chaves estrangeiras apontados pelo advisor |

Foram aplicadas no projeto com exatamente este SQL, nesta ordem; os nomes dos arquivos usam as mesmas versões registradas no banco (`supabase_migrations.schema_migrations`). Para recriar em outro projeto, aplique os arquivos em ordem.

## Modelo (resumo; fonte da verdade são as migrações)

- **Equipes e acesso:** `teams`, `team_members(role: coach | analyst | viewer)`.
- **Dados da equipe:** `players`, `evaluations`, `overall_weights`, `lineups` (+ `lineup_starters`, `lineup_bench`), `trainings` (+ `training_participants`, `training_exercises`), `training_events`.
- **Ids continuam texto** (os mesmos do app e dos backups), então a importação preserva ids e vínculos. O par `(team_id, id)` evita colisão entre equipes (ids de demonstração se repetem).
- **Não migrado de propósito:** `activity` (resumo de partidas, só demonstração). Chega como `null` até existir o módulo de partidas.
- **Regras no banco** (segunda linha de defesa; a primeira continua no domínio): camisa única por equipe; posição secundária diferente da principal; notas de 1 a 99; resultado compatível com o fundamento; `attempt_key` única por equipe (idempotência); exercício do **mesmo** treino; atleta de registro válido participa do treino; treino concluído exige `completed_at`; avaliação nunca é editada; registro só pode ser **anulado** (`voided_at`/`voided_by`) e a anulação não se desfaz; excluir treino leva exercícios, participantes e registros; excluir exercício ou atleta que tem registros é recusado.

## Quem pode o quê

| | coach | analyst | viewer | sem login (anon) |
|---|---|---|---|---|
| Ler dados da equipe | sim | sim | sim | não |
| Elenco, pesos do Overall, escalações | escreve | só lê | só lê | não |
| Avaliações | acrescenta | acrescenta | só lê | não |
| Treinos, exercícios, participantes | cria, edita, exclui | cria e edita (não exclui treino) | só lê | não |
| Registros de treino | acrescenta e anula | acrescenta e anula | só lê | não |
| Membros da equipe | gerencia | só lê | só lê | não |

Quem não é membro de uma equipe não enxerga nada dela. Criar equipe só por `create_team(nome)` (quem cria vira coach); adicionar pessoas por `add_team_member(equipe, e-mail, papel)` (só coach, e a pessoa precisa já ter entrado uma vez).

Os avisos "SECURITY DEFINER executável por usuário logado" do advisor para `create_team` e `add_team_member` são **intencionais**: as duas funções validam login e papel por dentro e não são executáveis por `anon`.

## Testes do banco

`supabase/tests/rls.test.sql` simula usuários de duas equipes e os três papéis (JWT + role `authenticated`), confere o que deve funcionar e o que deve falhar (RLS, privilégios, integridade entre equipes, append-only, cascatas) e **termina sempre com uma exceção**, desfazendo tudo. Resultado esperado: erro com a mensagem `TESTES_OK: …`. Qualquer outra mensagem indica a verificação que falhou. Rode depois de **toda** migração. Última execução: `TESTES_OK` (após a migração 0300).

## Ajustes manuais no painel do Supabase (não dá para versionar aqui)

1. **Authentication → Sign In / Providers → "Allow new users to sign up": desligar** quando a equipe já tiver entrado, e convidar as demais pessoas pelo painel. Com cadastro aberto, qualquer pessoa que souber a URL pode criar conta e uma equipe vazia (sem acesso aos dados de outras, mas ocupando espaço).
2. **Authentication → URL Configuration:** definir a *Site URL* e as *Redirect URLs* do endereço real do app antes de ligar o login por link mágico.
3. **Authentication → Email:** conferir o remetente padrão (limite baixo de envios) e, se necessário, configurar SMTP próprio.

## Limites conhecidos desta fase

- Remover ou rebaixar o **último coach** não é bloqueado (um coach pode se tirar da equipe). Tratar na tela de membros.
- A regra "ninguém aparece duas vezes na escalação" (titulares + líbero + reservas) é garantida pelo domínio; no banco só vale dentro de titulares e dentro de reservas.
- A regra "não remover da lista de participantes quem tem registro válido" fica no domínio/gateway (no banco, só a inserção de registro exige participação).
- Troca de dados por inteiro (restaurar backup) ainda não tem função transacional no banco.

## Próximas fases (não iniciadas)

1. **Auth no app:** tela de login por e-mail (link mágico), escolha/criação de equipe, `@supabase/supabase-js` (dependência a justificar), variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. **`SupabaseGateway`** implementando `DataGateway` (mapeamento linha ↔ domínio; `attemptKey` para idempotência; `usage`/`snapshot` reinterpretados), atrás de uma configuração, com `LocalStorageGateway` como padrão até a virada.
3. **Importação transacional** do arquivo de backup (função no banco, tudo ou nada, com prévia) para levar os dados locais atuais, e depois a virada do app para a nuvem.
4. Convites e papéis na interface; política de retenção/backup do banco.
