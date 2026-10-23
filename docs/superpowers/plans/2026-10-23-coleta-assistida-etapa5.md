# Coleta assistida, etapa 5: detalhar qualquer ponto pela revisão com vídeo

**Goal:** Na tela de revisão, escolher QUALQUER ponto ativo da partida (não só o último) e registrar ações técnicas dele (atleta, fundamento, resultado) vendo o vídeo, com as trilhas associadas sugerindo quem aparece no quadro. Quem confirma é sempre a pessoa.

**Spec:** `docs/superpowers/specs/2026-10-23-coleta-assistida-design.md` (seção 4.4).

## Pré-requisito verificado (sem mudança de regra, sem migração)
- Local: `addRallyActionOp` (`src/data/matchOps.ts`) aceita ação em qualquer ponto **ativo** de partida **não concluída**; recusa ponto desfeito, partida concluída, atleta fora do elenco, resultado que não vale para o fundamento; idempotente por `attemptKey`.
- Nuvem: `public.add_rally_action` (migração `20261013134608_matches`) tem exatamente as mesmas recusas e a mesma idempotência; a assinatura recebe `rally_id`, sem restrição ao último ponto. **Nenhuma migração nova.**

## Global Constraints
- Ação técnica é camada separada do motivo e do atleta do ponto: nunca se cria sozinha a partir deles nem das trilhas (regra 11). Sugestão só preenche o seletor de atleta.
- Desfazer anula (`voidedAt`), nunca apaga. Nada aqui altera placar, ponto, nota ou Overall.
- Sem conexão com a nuvem: trava e avisa (regra 15). Partida concluída: explica e pede para reabrir.
- Textos em pt-BR, alvos de 44 px, sem rolagem horizontal de 360 a 1920 px.

## Review Focus
- Partida concluída: painel avisa e não deixa registrar.
- Duplo clique / tela atrasada: um registro só (guarda de gravação em andamento + `attemptKey`).
- Atleta sugerido que saiu do elenco: não aparece como sugestão.
- Ponto desfeito depois de aberto o painel: painel fecha e não registra.
- Ponto com motivo e atleta já informados: o painel não pré-registra nada.

### Task 1: `suggestedAthletes` (domínio)
- `src/domain/videoReviewData.ts`: `suggestedAthletes(data: ReviewData, visibleTrackIds: readonly number[], playerIds: ReadonlySet<string>): string[]` (atletas únicos das trilhas visíveis, na ordem das trilhas, só do elenco atual). Testes em `videoReviewData.test.ts`.

### Task 2: Painel "Detalhar o ponto"
- `src/features/matches/review/ReviewDetail.tsx`: atleta (com sugestões), fundamento, resultados, ações do ponto com "Desfazer"; usa `actions.addRallyAction`/`undoRallyAction`. Botão "Detalhar o ponto N x M" em cada linha de `ReviewPoints.tsx`, com contagem de ações. Testes de tela em `matchReview.test.tsx`.

### Task 3: Navegador real, docs e verificação
- `e2e/review.spec.ts`: detalhar o 1º ponto de 3 (não o último) e conferir; viewports. Docs (`SCREEN_MAP` tela 09, `PRODUCT_SPEC`, `CLAUDE.md`). `tsc`, `vitest`, `build`, `test:e2e`. Sem commit até o pedido.
