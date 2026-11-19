# Cadastro por conta própria, com convite por código

**Goal:** Quem quiser usar o Alpha7 cria a própria conta no app e entra na equipe com um código de convite gerado pela comissão técnica, sem ninguém abrir o painel do Supabase.

**Decisões do dono (2026-11-19):** entrada por **convite com código** (o coach escolhe papel, validade e número de usos); quem **não** tem convite **pode criar a própria equipe** (a tela "Criar sua equipe" continua).

## Arquitetura
- **Banco (migração nova `20261119120000_team_invites`)**: tabela `team_invites` (guarda só o **hash** do código; o código aparece uma vez, na criação), funções `create_team_invite`, `redeem_team_invite`, `revoke_team_invite`, limite de tentativas por pessoa. Nenhuma escrita direta na tabela; só o coach lê a lista (sem a coluna do hash).
- **App**: `signUp` no `AuthProvider`; modo "Criar conta" na tela de login; tela "sem equipe" passa a pedir o código (ou criar equipe); link de convite `?convite=CÓDIGO` pré-preenche; seção **Convites** em Configurações → Conta e equipe (só coach): criar, copiar, listar, revogar.
- **Fora do código (painel do Supabase, manual, do dono)**: ligar "Allow new users to sign up" e decidir confirmação de e-mail/SMTP. Documentado em `supabase/README.md`.

## Global Constraints
- A RLS e as funções decidem; a interface só reflete (`permissions.ts` ganha `team:invite`, só coach).
- Código fraco nunca: 12 caracteres hexadecimais aleatórios (48 bits), comparação por hash, 10 tentativas inválidas a cada 15 min por pessoa.
- Resposta de convite inválido é **a mesma** para código inexistente, expirado, revogado ou esgotado (não revela qual).
- Quem já é membro da equipe do convite não perde papel nem consome uso.
- Textos pt-BR; alvos de 44 px; sem rolagem horizontal de 360 a 1920 px; nada anima o registro.
- Nova migração é aplicada no projeto **só depois da confirmação do dono**, seguida de `supabase/tests/invites.test.sql` (termina em `TESTES_OK`) e dos advisors.

## Review Focus
- Código digitado em minúsculas, com espaços ou sem hífens funciona.
- Dois cliques em "Entrar na equipe" consomem um uso só.
- Convite de coach exige aviso claro na criação (dá poder total).
- Link de convite com a pessoa já logada em outra conta.
- Falha de rede no meio do resgate: erro claro, nada pela metade (função é uma transação).

### Task 1: Banco
Migração + `supabase/tests/invites.test.sql` (papéis, hash invisível, expirado, revogado, esgotado, já membro, limite de tentativas, anon, parâmetros inválidos, escrita direta negada).
### Task 2: Tipos e simulador
`database.types.ts` (tabela e funções), `fakeSupabase.ts` (mesmas regras), código de convite puro em `src/auth/inviteCode.ts` com testes.
### Task 3: Conta
`signUp` + tela "Criar conta" + captura de `?convite=`; testes de tela.
### Task 4: Equipe e convites
Tela sem equipe com código; `SessionInfo` com criar/listar/revogar; painel **Convites**; testes.
### Task 5: Verificação e docs
`tsc`, `vitest`, `build`, `test:e2e`, olhar a tela; `supabase/README.md`, `DATA_SAFETY.md`, `PRODUCT_SPEC.md`, `CLAUDE.md`; migração aplicada e provada no banco real (com o ok do dono).
