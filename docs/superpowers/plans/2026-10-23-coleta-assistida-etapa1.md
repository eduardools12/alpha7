# Coleta assistida, etapa 1 (sugestão do sacador + rodízio e teclado no treino) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir a busca por atletas no registro: na partida, o app sugere o sacador (para confirmar) em ace e erro de saque do Alpha7; no treino, o app passa para o próximo atleta sozinho e aceita atalhos de teclado.

**Architecture:** Regras puras novas em `domain/` (sugestão do sacador; rodízio e atalhos), consumidas por `MatchLivePage` e `TrainingRecordPage`. Nenhuma mudança em gateway, banco, permissões ou formato de dados.

**Tech Stack:** React 19, TypeScript estrito, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-coleta-assistida-design.md` (seções 3.1 e 3.3). As etapas 2 a 5 do spec terão planos próprios.

## Global Constraints

- Motivo do ponto e ação técnica são camadas separadas: **a sugestão do sacador preenche só `playerId` do ponto; nunca cria `RallyAction`** (regra 11).
- O sacador vem de `RallyContext.serverPlayerId` (calculado), nunca digitado.
- A sugestão **nunca grava sozinha**: só depois de "Confirmar" (decisão do dono).
- Cada tentativa de treino continua sendo **um evento** com `attemptKey` próprio (regra 8); desfazer anula.
- Textos em português do Brasil, frase com inicial maiúscula, voz ativa; botão diz o que faz.
- Alvos de toque de 44 px, nomes acessíveis, `aria-pressed`, foco visível; nada anima o registro (regra 14).
- Sem dependência nova; tipos estritos, sem `any`/`as` para silenciar erro.
- `typecheck`, `npm test`, `build` e `test:e2e` precisam passar antes de dar a etapa por concluída; dizer o que foi simulado e o que foi navegador real.
- Não commitar nem publicar sem o dono pedir.

## Review Focus

- **Sacador desconhecido** (`serverPlayerId` nulo): não aparece barra e o ponto grava direto como hoje. Coberto no domínio (Task 1); pela tela é inalcançável, porque o app recusa carregar um set sem titulares.
- **Sacador sugerido fora do elenco** (atleta excluído): não aparece barra; grava direto. Teste na Task 2.
- **Toque duplo em "Confirmar"**: um só ponto (trava `inFlight` + `attemptKey`). Teste na Task 2.
- **Falha ao gravar com a barra aberta**: o erro fica na tela, a barra continua aberta e nada é gravado. Teste na Task 2.
- **Entradas ruins no rodízio e no teclado**: número de tentativas vazio, 0 ou 1000 vira 1..20; participante único; digitar num campo de texto não dispara atalho; seta sem atleta escolhido seleciona o primeiro. Testes nas Tasks 3 e 4.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/domain/match.ts` (modificar) | `suggestedInvolved` |
| `src/domain/match.test.ts` (modificar) | testes da sugestão |
| `src/domain/trainingRotation.ts` (criar) | `stepParticipantId`, `afterRegistration`, `clampSeries`, `interpretShortcut` |
| `src/domain/trainingRotation.test.ts` (criar) | testes do rodízio e dos atalhos |
| `src/features/matches/MatchLivePage.tsx` + `.module.css` (modificar) | barra de confirmação do sacador |
| `src/features/matches/matches.test.tsx` (modificar) | testes novos e ajuste dos que tocam "Ace" |
| `e2e/matches.spec.ts` (modificar) | fluxo com a confirmação |
| `src/features/trainings/TrainingRecordPage.tsx` + `.module.css` (modificar) | painel de rodízio e atalhos |
| `src/features/trainings/record.test.tsx` (modificar) | testes de rodízio e teclado |
| `CLAUDE.md`, `docs/SCREEN_MAP.md` (modificar) | estado real da etapa |

---

### Task 1: Regra de domínio `suggestedInvolved`

**Files:**
- Modify: `src/domain/match.ts` (perto de `reasonProblem`, linha ~306)
- Test: `src/domain/match.test.ts`

**Interfaces:**
- Produces: `suggestedInvolved(reason: RallyReason | null, winner: Side, context: Pick<RallyContext, 'servingSide' | 'serverPlayerId'>): string | null`

- [ ] **Step 1: Escrever os testes que falham** em `describe('registro de rallies e fechamento do set')` (ou bloco novo `describe('sugestão do sacador')`), com `ctx = { servingSide: 'us', serverPlayerId: 'p1' }`:
  - `ace` vencido por `us` com `servingSide 'us'` → `'p1'`.
  - `erro_saque` com `winner 'them'` e `servingSide 'us'` → `'p1'` (erro de saque do Alpha7).
  - `ace` com `winner 'them'` (ace sofrido) → `null`; `erro_saque` com `winner 'us'` → `null` (erro do adversário).
  - `ataque`, `bloqueio`, `erro_ataque`, `erro_recepcao`, `erro_outro`, `outro` e `null` → `null` em qualquer lado.
  - `servingSide: 'them'` com qualquer motivo → `null`; `serverPlayerId: null` com `ace`/`us` → `null`.
- [ ] **Step 2: Rodar `npx vitest run src/domain/match.test.ts`.** Esperado: FAIL (`suggestedInvolved` não existe).
- [ ] **Step 3: Implementar** `suggestedInvolved` em `match.ts` com a assinatura acima e comentário de uma linha explicando que só o sacador do Alpha7 é deduzível com certeza.
- [ ] **Step 4: Rodar o mesmo teste.** Esperado: PASS.

---

### Task 2: Barra de confirmação do sacador na partida ao vivo

**Files:**
- Modify: `src/features/matches/MatchLivePage.tsx` (função `record`, ~linha 161, e bloco `Card title="Quem ganhou o ponto?"`, ~linha 303), `src/features/matches/MatchLivePage.module.css`
- Test: `src/features/matches/matches.test.tsx`, `e2e/matches.spec.ts`

**Interfaces:**
- Consumes: `suggestedInvolved` (Task 1); `context` (`RallyContext`), `involvedId`, `playersById`, `guarded`, `actions.recordRally` já existentes na página.
- Produces: estado `suggestion: { winner: Side; reason: RallyReason; playerId: string } | null`; função `commit(winner: Side, reason: RallyReason | null, playerId: string | null): void`.

- [ ] **Step 1: Escrever os testes que falham** em `describe('Acompanhamento ao vivo')`, usando `openLive`, `startFirstSet`, `tap`, `stored`, `pointsOf` (o sacador do set 1 é `p1`, "Ana A. #1"):
  - `'ace do Alpha7 sem atleta escolhido mostra a barra e só grava ao confirmar'`: clicar em "Ace" → existe `group` "Confirmar o atleta do ponto" com o texto "Ace de Ana A. #1" e `stored(ctx).rallies` tem 0 itens; clicar em "Confirmar Ana A. #1" → 1 rally `{ reason: 'ace', playerId: 'p1' }`, a barra some e `stored(ctx).rallyActions` é `[]`.
  - `'erro de saque do Alpha7 também sugere o sacador'`: tocar "Ponto do adversário" (adversário saca) e depois "Ponto do Alpha7"... não: para o Alpha7 sacar e perder, usar "Ponto do adversário" no primeiro ponto, com o botão de motivo `Erro de saque do Alpha7` (lado do adversário, existe quando o Alpha7 saca) → barra "Erro de saque de Ana A. #1" → confirmar grava `{ winnerSide: 'them', reason: 'erro_saque', playerId: 'p1' }`.
  - `'Sem atleta grava o ponto sem atleta'` → `playerId` nulo.
  - `'Escolher outro atleta fecha a barra sem gravar e o chip escolhido vale no próximo toque'`: botão "Escolher outro atleta" fecha a barra, 0 rallies; escolher o chip "Bia B. #2" e tocar "Ace" grava direto com `playerId: 'p2'` (sem barra).
  - `'atleta já escolhido não abre a barra'`.
  - `'ace sofrido e ponto genérico não abrem a barra'` (adversário sacando; "Ponto do Alpha7" sem motivo grava direto).
  - `'sacador fora do elenco grava direto'`: `starters[0].playerId` apontando para id que não está em `players`.
  - `'toque duplo em Confirmar grava um ponto só'` (dois cliques seguidos → 1 rally).
  - `'falha ao gravar mantém a barra aberta e mostra o erro'`: reaproveitar o padrão de falha do teste "a falha ao gravar aparece na tela" (`wrapGateway`); a barra continua e `stored(ctx).rallies` é `[]`.
- [ ] **Step 2: Rodar `npx vitest run src/features/matches/matches.test.tsx`.** Esperado: os novos FALHAM e dois existentes (`'um toque registra o ponto...'`, linha ~184, e `'ações técnicas ficam separadas...'`, linha ~287 usa `tap(ctx, 'Ace')` como motivo) também FALHAM, porque agora "Ace" abre a barra.
- [ ] **Step 3: Implementar em `MatchLivePage.tsx`:** (a) estado `suggestion`; (b) separar `commit(winner, reason, playerId)` (o corpo atual de `record`, usando o `playerId` recebido e limpando `suggestion` **depois** do sucesso, dentro de `guarded`); (c) `record(winner, reason)` passa a: limpar `suggestion`, e, se `involvedId === null` e `suggestedInvolved(reason, winner, context)` devolver um id presente em `playersById`, só abrir a barra (`setSuggestion`) e retornar; caso contrário `commit(winner, reason, involvedId)` e `setInvolvedId(null)` após sucesso como hoje; (d) renderizar, logo abaixo do grupo de chips, `<div role="group" aria-label="Confirmar o atleta do ponto">` com o texto "{Motivo}: {nome} #n (sacador)?" e três botões: "Confirmar {label}" (chama `commit(..., suggestion.playerId)`; desabilitado enquanto `pending || offline`), "Escolher outro atleta" (limpa a barra) e "Sem atleta" (`commit(..., null)`). O texto do motivo usa `reasonLabel(reason, winner)` (ex.: "Ace", "Erro de saque do Alpha7"). Mover o foco para "Confirmar" ao abrir (ref + `useEffect`). Sem animação; estilo com tokens, botões de 44 px, `.module.css` com a barra destacada (borda `--line-accent`).
- [ ] **Step 4: Ajustar os testes existentes** `'um toque registra o ponto...'` e `'ações técnicas ficam separadas...'` para clicar em "Ace" e depois em "Confirmar Ana A. #1" (ou "Sem atleta" onde o teste exigir `playerId` nulo, mantendo as asserções originais). Rodar `npx vitest run src/features/matches`. Esperado: tudo PASS.
- [ ] **Step 5: Ajustar `e2e/matches.spec.ts`** (linhas ~46 e ~103: cliques em "Ace" e laço de motivos) para confirmar a barra (clicar "Sem atleta" no laço, para manter as asserções de contagem). Rodar `npx playwright test --project=local matches` e conferir a tela de verdade (captura mobile 390 px e desktop 1440 px com a barra aberta, sem rolagem horizontal). Esperado: PASS.

---

### Task 3: Regras puras do rodízio e dos atalhos

**Files:**
- Create: `src/domain/trainingRotation.ts`
- Test: `src/domain/trainingRotation.test.ts`

**Interfaces:**
- Produces:
  - `stepParticipantId(orderedIds: readonly string[], currentId: string | null, step: 1 | -1): string | null` — circular; lista vazia → `null`; `currentId` nulo ou ausente da lista → primeiro (para `1`) ou último (para `-1`).
  - `clampSeries(value: number): number` — inteiro de 1 a 20; `NaN`, vazio ou fracionário vira o inteiro válido mais próximo (`NaN` → 1).
  - `afterRegistration(settings: { enabled: boolean; every: number }, doneInSeries: number): { advance: boolean; doneInSeries: number }` — desligado: `{ advance: false, doneInSeries: 0 }`; ligado: soma 1 e, ao alcançar `clampSeries(every)`, `advance: true` e zera.
  - `interpretShortcut(key: string, outcomeCount: number): { kind: 'outcome'; index: number } | { kind: 'player'; step: 1 | -1 } | null` — `'1'..'9'` → `index = n-1` só se `n <= outcomeCount`; `ArrowRight` → `step 1`; `ArrowLeft` → `step -1`; qualquer outra tecla → `null`.

- [ ] **Step 1: Escrever os testes que falham** com as assinaturas acima: circularidade (`['a','b','c']`, `'c'` + 1 → `'a'`; `'a'` − 1 → `'c'`), lista vazia, um só participante (devolve ele mesmo), `currentId` inexistente, `clampSeries(0)=1`, `clampSeries(1000)=20`, `clampSeries(NaN)=1`, `clampSeries(2.7)=3`, `afterRegistration` com `every: 3` ao longo de 3 chamadas (`false,false,true` e contador volta a 0), desligado nunca avança, e `interpretShortcut` para `'1'`, `'4'` com 3 resultados (→ `null`), `'0'`, `'ArrowLeft'`, `'a'`.
- [ ] **Step 2: Rodar `npx vitest run src/domain/trainingRotation.test.ts`.** Esperado: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar as quatro funções em `trainingRotation.ts`** (puras, sem React; dependência de domínio zero).
- [ ] **Step 4: Rodar o teste.** Esperado: PASS.

---

### Task 4: Rodízio e atalhos na tela de registro do treino

**Files:**
- Modify: `src/features/trainings/TrainingRecordPage.tsx` (estado e `record`, ~linhas 56-215; painel perto da seção "Jogador", ~linha 285), `src/features/trainings/TrainingRecordPage.module.css`
- Test: `src/features/trainings/record.test.tsx`

**Interfaces:**
- Consumes: `stepParticipantId`, `clampSeries`, `afterRegistration`, `interpretShortcut` (Task 3); `participants`, `outcomes`, `currentPlayer`, `locked`, `offline`, `record` já existentes.
- Produces: estados `rotationOn: boolean`, `rotationEvery: number`, `doneInSeries: number`.

- [ ] **Step 1: Escrever os testes que falham** (treino aberto `demo-t-04`, helpers `open`, `pickPlayer`, `pickFundamental`, `tap`, `stored`):
  - `'rodízio ligado passa para o próximo atleta a cada registro'`: marcar a caixa "Passar para o próximo atleta" (nome acessível real), escolher um atleta, registrar um resultado; o botão do próximo atleta (por camisa) fica `aria-pressed="true"` e o registro ficou com o atleta anterior.
  - `'rodízio a cada N tentativas'`: com N = 3, só no terceiro registro o atleta muda; os 3 primeiros ficam no mesmo atleta.
  - `'rodízio desligado mantém o atleta (comportamento de hoje)'`.
  - `'N vazio, 0 ou 1000 vira um valor válido'`: digitar e checar `toHaveValue(1 / 20)`.
  - `'rodízio com participante único continua nele'`.
  - `'teclas 1 a 4 registram o resultado correspondente e setas trocam de atleta'`: sem atleta, seta direita seleciona o primeiro; tecla `1` com atleta escolhido registra o primeiro resultado do fundamento.
  - `'atalhos não disparam ao digitar num campo de texto'`: focar o campo de N e digitar `1` não registra.
  - `'atalhos respeitam o bloqueio e o modo sem conexão'` (com `locked` ou offline, tecla `1` não registra).
- [ ] **Step 2: Rodar `npx vitest run src/features/trainings/record.test.tsx`.** Esperado: os novos FALHAM.
- [ ] **Step 3: Implementar:** painel "Rodízio de atletas" abaixo da seção Jogador, com `<input type="checkbox">` e rótulo "Passar para o próximo atleta" e `<input type="number" min={1} max={20}>` rotulado "Tentativas por atleta antes de trocar" (valor passado por `clampSeries` ao sair do campo e ao registrar). Em `record`, depois do sucesso do evento, calcular `afterRegistration` e, se `advance`, `setPlayerId(stepParticipantId(participants.map(p => p.id), currentPlayer.id, 1))`. `useEffect` com `keydown` (limpo no desmonte) que ignora `ctrl/meta/alt`, alvos `input/textarea/select/[contenteditable]` e os estados `locked`/`offline`/sem atleta (exceto setas), e usa `interpretShortcut(key, outcomes.length)`. Mostrar a dica "Atalhos: 1 a {n} para o resultado, setas para trocar de atleta" num `details`/texto discreto. Texto de ajuda com `aria-live` já existente anuncia o novo atleta.
- [ ] **Step 4: Rodar o teste e a tela.** `npx vitest run src/features/trainings` → PASS; abrir `/treinos/<id>/registrar` (preview) em 390 px e 1440 px e conferir o painel sem rolagem horizontal.

---

### Task 5: Documentação e verificação final da etapa

**Files:**
- Modify: `CLAUDE.md` (tabela "Estado atual": linha "Coleta assistida (etapa 1)"), `docs/SCREEN_MAP.md` (partida ao vivo e registro de treino)
- Test: suíte completa

- [ ] **Step 1: Atualizar os docs** dizendo, sem exagero: o que existe (sugestão do sacador com confirmação; rodízio; atalhos), que **não** cria ação técnica, e que a verificação foi por testes e navegador real em computador (não em celular de verdade).
- [ ] **Step 2: Rodar a verificação completa:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run test:e2e`. Esperado: tudo passando; relatar os números.
- [ ] **Step 3: Não commitar.** Apresentar o resumo e perguntar se commita e publica.

---

## Self-review (feita)

- **Cobertura do spec:** 3.1 → Tasks 1-2; 3.3 → Tasks 3-4; 3.2 (quadra clicável) fica para a etapa 2, como no spec.
- **Consistência de tipos:** `suggestedInvolved`, `stepParticipantId`, `clampSeries`, `afterRegistration` e `interpretShortcut` têm a mesma assinatura em Interfaces e nos passos.
- **Testes existentes afetados** listados na Task 2 (`matches.test.tsx` ~184 e ~287; `e2e/matches.spec.ts` ~46 e ~103).
- **Proporção:** plano menor que o código que descreve; corpos de função ficam com quem implementa.
