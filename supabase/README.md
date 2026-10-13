# Supabase do Alpha7

Banco e acesso do Alpha7 na nuvem.

**Estado (0.4.0):**

- **Fase 1 (banco): feita.** Esquema, RLS por equipe, papéis e testes executados no banco real.
- **Fase 2 (aplicativo): feita, desligada por padrão.** Login por e-mail e senha, escolha de equipe, papéis na interface e `SupabaseGateway`, ativados só com `VITE_DATA_BACKEND=supabase`. O padrão continua `local` (localStorage), exatamente como antes.
- **Nenhum dado real foi enviado ao banco.** Não existe migração dos dados locais para a nuvem (fase seguinte). Nenhuma migração nova foi criada ou aplicada na fase 2.

| Item | Valor |
|---|---|
| Projeto | `alpha7` (ref `jpvktlxuwdebvcbkzesk`), organização `eduardools12's Org`, região `sa-east-1` (São Paulo), plano gratuito (US$ 0/mês) |
| URL da API | `https://jpvktlxuwdebvcbkzesk.supabase.co` |
| Chave para o frontend | somente a **publishable** (`sb_publishable_…`) ou a anon legada, em `.env.local` (ignorado pelo Git). A `service_role` / `sb_secret_…` **nunca** vai ao frontend nem ao repositório (o app recusa a chave secreta e mostra erro) |

A URL e a chave publishable **podem** ficar no navegador: o acesso aos dados depende das políticas RLS do banco, nunca de esconder essas credenciais.

## Como ligar o backend Supabase no aplicativo

Variáveis de ambiente (modelo em `.env.example`; copie para `.env.local`, que o Git ignora):

| Variável | Valor | Observação |
|---|---|---|
| `VITE_DATA_BACKEND` | `local` (padrão) ou `supabase` | Vazia ou ausente = `local`. Qualquer outro valor é **erro explícito na tela**, sem trocar de backend e sem mexer em dados locais |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Obrigatória com `supabase`. `http` só vale para `localhost` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publishable (ou anon legada) | Obrigatória com `supabase`. Chave `service_role`/`sb_secret_` é recusada |

Reinicie o servidor (`npm run dev`) depois de mudar. Configuração incompleta ou inválida mostra a tela "Configuração do Alpha7" com o que ajustar (sem exibir valores de credenciais).

**Com `local`:** nada muda. Sem login, sem rede, com backup, recuperação e demonstração como antes.
**Com `supabase`:** o app pede login; depois abre a equipe da pessoa; os dados vêm do banco. Os dados locais do navegador **não são lidos nem alterados** e **nunca se misturam** com os remotos. Equipe sem dados abre **vazia** (nunca demonstração). Falha de leitura é erro explícito, nunca uma demonstração criada em silêncio.

### Primeiro acesso de uma equipe (procedimento)

1. **No painel do Supabase (manual):** criar a conta da primeira pessoa em *Authentication → Users* (adicionar/convidar usuário, com e-mail e senha). O aplicativo **não tem cadastro público** e não cria contas.
2. A pessoa entra no app com e-mail e senha. Sem equipe, o app oferece **"Criar sua equipe"** (função `create_team`): ela vira **coach**.
3. Para adicionar mais gente: criar a conta no painel (passo 1) e, no app, em **Configurações → Conta e equipe → Adicionar pessoa à equipe** (só coach), informar o e-mail e o papel. Isso chama a função `add_team_member` do banco; o app **nunca** escreve direto em `team_members`.
4. Cada pessoa pode trocar a senha por **"Esqueci minha senha"** (ver abaixo).

Uma pessoa pode pertencer a várias equipes (o modelo permite): com mais de uma, o app mostra a escolha, e **"Trocar de equipe"** (barra lateral ou Configurações) limpa da memória os dados da anterior antes de abrir a outra.

### Recuperação de senha: o que precisa ser feito no painel

O link de redefinição só funciona depois de ajustes **manuais** (não versionáveis):

1. **Authentication → URL Configuration:** definir a *Site URL* e incluir em *Redirect URLs* o endereço do app: `https://alpha7-liart.vercel.app` (produção, ver `README.md`, seção Publicação) e `https://alpha7-liart.vercel.app/**`, mais `http://localhost:5173/**` para desenvolvimento. O app envia `redirectTo = <origem do app>/`.
2. **Authentication → Email:** conferir o remetente padrão (limite baixo de envios por hora) e, se necessário, configurar SMTP próprio.
3. O app usa o fluxo **PKCE**: o link deve ser aberto **no mesmo navegador** em que foi pedido. Abrir em outro aparelho não funciona (peça de novo).
4. Ao abrir o link, o app mostra "Escolher nova senha" (mínimo de 8 caracteres) antes de liberar o uso.

Até esses ajustes serem feitos, o e-mail pode não chegar ou o link pode levar a um endereço recusado. O app responde igual exista a conta ou não (não revela quem tem acesso).

## Papéis e permissões

| | coach | analyst | viewer | sem login (anon) |
|---|---|---|---|---|
| Ler dados da equipe | sim | sim | sim | não |
| Elenco, pesos do Overall, escalações | escreve | só lê | só lê | não |
| Avaliações | acrescenta | acrescenta | só lê | não |
| Treinos, exercícios, participantes | cria, edita, exclui | cria e edita (não exclui treino) | só lê | não |
| Registros de treino | acrescenta e anula | acrescenta e anula | só lê | não |
| Membros da equipe | gerencia | só lê | só lê | não |

**Quem decide é o banco (RLS).** A interface só esconde ou desabilita o que o banco recusaria: `src/auth/permissions.ts` espelha as políticas, e o teste `src/auth/permissions.test.ts` lê o arquivo SQL da migração e **falha se a matriz da interface divergir das políticas**. Tentativas de escrita sem permissão (por botão que escapou, por endereço digitado ou por requisição direta) são recusadas pelo banco e chegam à tela como mensagem, nunca como sucesso falso.

Os avisos "SECURITY DEFINER executável por usuário logado" do advisor para `create_team` e `add_team_member` são **intencionais**: as duas funções validam login e papel por dentro e não são executáveis por `anon`.

## Como o `SupabaseGateway` trabalha

Implementa o mesmo contrato `DataGateway` do `LocalStorageGateway`, **operação por operação** (não grava o workspace inteiro de uma vez). `src/data/supabase/`:

| Arquivo | Papel |
|---|---|
| `config.ts` | Lê e valida `VITE_*`; recusa chave secreta |
| `client.ts` | Cliente único e tipado (`createClient<Database>`), sessão persistida, renovação automática, fluxo PKCE |
| `database.types.ts` | Tipos gerados do esquema real. **Regerar depois de toda migração** (MCP `generate_typescript_types` ou `supabase gen types typescript`) |
| `mappers.ts` | Conversão explícita linha SQL ↔ tipos do domínio, com validação (dado fora do formato vira erro, não coerção) |
| `SupabaseGateway.ts` | Consultas sempre restritas à equipe (`team_id`), leitura paginada, tradução de erros |

Comportamento:

- **Leitura:** 10 consultas em páginas de 1000 linhas (o PostgREST corta em 1000 sem aviso), com ordem total estável. Participantes de treino chegam ordenados por id do atleta (a ordem de inclusão não é guardada).
- **Ids preservados** (texto, os mesmos do app) e vínculos conferidos pelas chaves estrangeiras com `team_id`.
- **Registros de treino:** `INSERT … ON CONFLICT (team_id, attempt_key) DO NOTHING` torna o envio **idempotente no banco**; a chave de um registro desfeito continua ocupada. Desfazer é `UPDATE … WHERE voided_at IS NULL` com `voided_by`; repetir é inofensivo.
- **Escrita sem permissão:** inserção/atualização recusadas dão erro `42501` (traduzido). `DELETE` e `UPDATE` sem permissão **não dão erro no banco** (a RLS só esconde a linha): o gateway confere se a linha ainda existe e, se existe, avisa "papel não permite" em vez de fingir sucesso.
- **Erros tipados** (mensagens em português, sem detalhes técnicos): permissão, sessão expirada, sem conexão, dado inesperado, integridade.
- **Não existe com dados na nuvem** (a interface esconde esses recursos e o gateway recusa sem alterar nada): substituir o workspace inteiro (restaurar demonstração, apagar tudo, importar backup), cópia de segurança automática e desfazer, cópia bruta, uso do armazenamento, atualização em tempo real entre abas. **Exportar backup funciona** (somente lê o que está no servidor).

### Limites e riscos desta fase (não resolvidos)

1. **Sem transação entre tabelas** (a API REST do Supabase não oferece). Escalação (3 tabelas) e treino (4 tabelas) gravam em etapas ordenadas: o treino grava de forma **aditiva** (o que entra primeiro, o que sai por último), então falhar no meio deixa um treino válido com itens a mais e repetir conclui; a escalação **apaga e reinsere** titulares e reservas (trocar dois titulares de lugar por UPDATE viola "ninguém duas vezes", comprovado no banco), então, se a reinserção falhar, o gateway tenta **restaurar o estado anterior** e, se isso também falhar, avisa que a escalação pode estar incompleta e pede para recarregar.
   **Correção mínima proposta (NÃO criada nem aplicada):** duas funções SQL `SECURITY INVOKER` (a RLS continua valendo), `save_lineup(team, jsonb)` e `save_training(team, jsonb, jsonb, jsonb)`, que fariam cada salvamento numa transação. Só vale a pena se a janela de falha parcial se mostrar um problema real; exige uma migração nova (com `rls.test.sql` estendido) e autorização.
2. **Excluir treino é definitivo na nuvem** (cascata, sem cópia de segurança nem desfazer). A interface pede confirmação com as contagens e só o coach pode.
3. **Duas pessoas editando ao mesmo tempo:** a última gravação vence por linha; não há bloqueio otimista nem aviso de conflito. A tela só se atualiza ao recarregar.
4. **Leitura não é um instantâneo:** as 10 consultas não compartilham transação, então uma alteração no meio pode aparecer pela metade até recarregar.
5. **Remover/rebaixar o último coach** não é bloqueado no banco.
6. A regra "ninguém aparece duas vezes na escalação" (titulares + líbero + reservas) vale no domínio; no banco só dentro de titulares e dentro de reservas.
7. "Não remover da lista de participantes quem tem registro válido" é conferida pelo gateway antes de gravar (condição de corrida possível entre duas pessoas); no banco só a inserção de registro exige participação.
8. A mensagem de erro da função `add_team_member` no banco diz "ainda não entrou no Alpha7"; o app a substitui por um texto correto (a conta precisa existir). Corrigir a mensagem exigiria nova migração.
9. Sem cadastro público no app, mas **o painel pode estar com cadastro aberto**: desligar "Allow new users to sign up" depois de criar as contas da equipe.

## Migrações (`supabase/migrations/`, em ordem)

| Arquivo | O que faz |
|---|---|
| `20261013101604_core_schema.sql` | Tabelas, chaves, restrições e gatilhos. Tudo pertence a uma equipe: chave primária `(team_id, id)` e chaves estrangeiras sempre com `team_id` |
| `20261013101642_rls_and_rpc.sql` | Funções de papel (schema `private`), RLS, privilégios, `create_team` e `add_team_member` |
| `20261013101855_fix_authenticated_privileges.sql` | Correção achada pelos testes: revoga os privilégios padrão do Supabase para `authenticated` e concede só o necessário |
| `20261013102000_missing_fk_indexes.sql` | Índices de chaves estrangeiras apontados pelo advisor |
| `20261013134608_matches.sql` | **0.5.0, aditiva:** partidas, sets, titulares do set, pontos e ações técnicas; funções transacionais de placar (`start_set`, `record_rally`, `void_last_rally`, `cancel_empty_set`, `conclude_match`, `reopen_match`, `add_rally_action`, `void_rally_action`); RLS e privilégios mínimos (sem escrita direta em sets/pontos/ações) |
| `20261013134700_matches_fk_indexes.sql` | Índices apontados pelo advisor de desempenho depois das partidas |

Aplicadas no projeto com exatamente este SQL, nesta ordem; os nomes usam as versões registradas no banco (`supabase_migrations.schema_migrations`). Migração aplicada **não se edita**: corrija com uma nova. Depois de cada migração: rodar os testes SQL abaixo, os advisors de segurança/desempenho e regerar `database.types.ts`.

## Modelo (resumo; a fonte da verdade são as migrações)

- **Equipes e acesso:** `teams`, `team_members(role: coach | analyst | viewer)`.
- **Dados da equipe:** `players`, `evaluations`, `overall_weights`, `lineups` (+ `lineup_starters`, `lineup_bench`), `trainings` (+ `training_participants`, `training_exercises`), `training_events`.
- **Ids continuam texto** (os mesmos do app e dos backups). O par `(team_id, id)` evita colisão entre equipes (ids de demonstração se repetem).
- **Não migrado de propósito:** `activity` (resumo de partidas, só demonstração): chega como `null`.
- **Regras no banco** (segunda linha de defesa; a primeira continua no domínio): camisa única por equipe; posição secundária diferente da principal; notas de 1 a 99; resultado compatível com o fundamento; `attempt_key` única por equipe; exercício do **mesmo** treino; atleta de registro válido participa do treino; treino concluído exige `completed_at`; avaliação nunca é editada; registro só pode ser **anulado** e a anulação não se desfaz; excluir treino leva exercícios, participantes e registros; excluir exercício ou atleta que tem registros é recusado.

## Testes: o que é simulado e o que roda no banco de verdade

| Teste | O que prova | Onde roda |
|---|---|---|
| `supabase/tests/rls.test.sql` | **RLS, privilégios, papéis, integridade entre equipes, append-only e cascatas, no banco real** | Banco `alpha7`, em transação que **sempre termina em exceção** (`TESTES_OK: …`), sem deixar dado |
| `supabase/tests/matches.test.sql` | **Partidas no banco real:** regras de pontuação, saque e rotação, idempotência, conflito (`40001`), ações inválidas desfazendo o ponto inteiro, gatilhos de “só anular”, formato travado, papéis (coach/analyst/viewer/outra equipe), isolamento entre equipes, cascata. Termina em `TESTES_OK` e desfaz tudo. Última execução: `TESTES_OK`, banco sem sobras | Idem |
| `supabase/tests/gateway_shapes.test.sql` | **As formas exatas de SQL que o gateway gera** (upsert, `ON CONFLICT DO NOTHING`, anular, excluir sem permissão = 0 linhas, troca de titulares) e as inferências sobre respostas da RLS, **com a RLS real** | Idem |
| `src/data/supabase/*.test.ts`, `src/auth/*.test.tsx`, `src/app/remote.test.tsx` | Comportamento do **código do aplicativo** (login, sessão, equipe, papéis na interface, gateway, erros, ausência de mistura local/remoto) contra um **cliente Supabase simulado** (`src/test/fakeSupabase.ts`) | Vitest, sem rede |
| `e2e/auth.spec.ts` | Tela de login em **navegador real** (acessibilidade, layout, falha de rede real), com o backend Supabase ligado e apontando para um endereço que nunca resolve | Playwright, sem tocar no projeto real |
| `src/auth/permissions.test.ts` | A matriz da interface e o simulador **coincidem com as políticas escritas no arquivo SQL** (lê o arquivo; não executa o banco) | Vitest |

**Os testes com cliente simulado NÃO provam que a RLS real funciona.** O simulador imita o formato das respostas da RLS para exercitar o código do aplicativo; a prova das políticas é dos dois arquivos SQL acima. Rode ambos depois de **toda** migração. Última execução dos dois: `TESTES_OK` (o banco ficou com 0 equipes, 0 atletas e 0 usuários depois de cada execução).

**Testado à mão com conta real (pelo dono do projeto, 2026-10-13):** login, criar equipe (a conta virou coach), cadastrar atleta e ver que continua depois de recarregar, e recuperação de senha de ponta a ponta no site publicado (e-mail recebido, link aberto no mesmo navegador, nova senha salva). Não há teste automatizado disso: depende de conta real e do e-mail.

O que **não** foi testado: a latência e o limite de linhas reais do PostgREST (simulado em 1000), papéis `analyst` e `viewer` com contas reais (só com o simulador e com a RLS no SQL), e adicionar pessoas pelo formulário do app com uma segunda conta real.

## Ajustes manuais no painel do Supabase (não dá para versionar aqui)

1. **Criar as contas** da equipe (Authentication → Users). O app não cadastra ninguém.
2. **Authentication → URL Configuration:** *Site URL* e *Redirect URLs* do endereço real do app, antes de usar "Esqueci minha senha".
3. **Authentication → Email:** conferir o remetente padrão e, se necessário, SMTP próprio.
4. **Desligar "Allow new users to sign up"** depois de criar as contas da equipe.

## Próximas fases (não iniciadas)

1. **Importação transacional** do arquivo de backup para a nuvem (função no banco, tudo ou nada, com prévia), para levar os dados locais atuais, e a virada do padrão para `supabase`.
2. Funções atômicas de salvamento de escalação/treino, se necessário (limite 1 acima).
3. Atualização em tempo real (Realtime) e política de conflitos entre pessoas.
4. Bloqueio do último coach, lista de membros com nomes, retenção e backup do banco.

## Partidas (0.5.0): papéis e avisos do advisor

- `viewer` lê tudo e não escreve nada; `analyst` cadastra/edita partidas e registra pontos e ações; só `coach` exclui partida e reabre partida concluída.
- Os 8 avisos “SECURITY DEFINER executável por usuários logados” do advisor para as funções de partida são **intencionais** (mesmo padrão de `create_team`): cada função confere o papel por dentro e as tabelas não aceitam escrita direta. O aviso de proteção contra senhas vazadas é do painel de autenticação e continua pendente.
- Aplicar em outro ambiente: `supabase/migrations/20261013134608_matches.sql` e depois `..._matches_fk_indexes.sql`, rodar `supabase/tests/matches.test.sql` e regerar `src/data/supabase/database.types.ts`.
