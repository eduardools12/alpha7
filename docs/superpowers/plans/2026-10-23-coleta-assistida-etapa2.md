# Coleta assistida, etapa 2 (atleta clicável na quadra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escolher o atleta envolvido no ponto tocando nele na quadra (P1 a P6, que gira com a rotação), sem procurar o nome numa lista.

**Architecture:** `RotationCourt` ganha modo interativo (props opcionais); `MatchLivePage` passa a mostrar a quadra clicável dentro do cartão "Quem ganhou o ponto?" no lugar da fileira de nomes dos titulares, mantendo o líbero como botão à parte. Mesmo estado `involvedId`; nenhuma mudança de regra, gateway ou banco.

**Tech Stack:** React 19, TypeScript estrito, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-coleta-assistida-design.md` (seção 3.2).

## Desvio do spec (decidido ao ler o código)
A quadra estava na coluna lateral ("Rotação atual"), que no celular fica abaixo de tudo, longe dos botões de ponto: tocar nela exigiria rolar a tela. Por isso a quadra clicável passa a viver **no cartão do ponto** e o cartão lateral "Rotação atual" sai (o texto "Saca agora" e a nota sobre substituições vão junto com a quadra).

## Global Constraints
- O nome acessível de cada posição é **exatamente** o do botão de atleta atual (`"Bia B. #2"`), para o fluxo e os testes existentes continuarem valendo; a posição e o papel vão em `aria-describedby` ("posição P2, Oposto").
- Alvos de toque de pelo menos 44 px, `aria-pressed`, foco visível, contraste 4,5:1, sem rolagem horizontal de 360 a 1920 px; nada anima o registro.
- Escolher na quadra e pelo botão do líbero é exclusivo (um atleta envolvido por vez); tocar de novo no escolhido desmarca; o valor vale só para o próximo ponto e some depois de gravar.
- Sem dependência nova; sem `as` para silenciar erro. Não commitar sem pedido.

## Review Focus
- **Quadra sem titular numa posição** (dado incompleto): a posição aparece desabilitada, sem quebrar.
- **Rotação**: depois de conquistar o saque, quem está em P1..P6 muda e a seleção continua pelo atleta, não pela posição.
- **Seleção vs. sugestão do sacador**: com atleta escolhido na quadra, ace não abre a barra (grava direto com ele).
- **Mobile 360 px**: a quadra cabe sem rolagem horizontal e os botões de ponto continuam à vista sem rolar muito.

## Tasks

### Task 1: `RotationCourt` interativo
**Files:** Modify `src/features/matches/RotationCourt.tsx` e `.module.css`; Create `src/features/matches/RotationCourt.test.tsx`.
**Interfaces:** Produces props opcionais `selectedId?: string | null` e `onSelect?: (playerId: string) => void`; sem `onSelect`, a saída é a de hoje (lista só de leitura).
- [ ] Teste (falha primeiro): sem `onSelect`, nenhum `button`; com `onSelect`, seis `button` com nome exatamente `"Ana A. #1"`, `aria-pressed` igual a `selectedId === id`, descrição `"posição P1, Levantador"`; clicar chama `onSelect` com o id; posição sem titular → botão desabilitado.
- [ ] Implementar: cada `li` vira `button` (tag preservada dentro do `li`); botão ocupa a posição inteira (mín. 44 px), `aria-describedby` para um `span` oculto com posição e papel.
- [ ] `npx vitest run src/features/matches/RotationCourt.test.tsx` → PASS.

### Task 2: Quadra no cartão do ponto
**Files:** Modify `src/features/matches/MatchLivePage.tsx` e `.module.css`, `src/features/matches/matches.test.tsx`, `e2e/matches.spec.ts`.
**Consumes:** `RotationCourt` (Task 1), `involvedId`/`setInvolvedId`, `liberoPlayer`, `context`.
- [ ] Testes (falham primeiro) em `describe('Acompanhamento ao vivo')`: (a) descrição "posição P2, Oposto" no botão "Bia B. #2" dentro do grupo "Atleta envolvido no próximo ponto"; (b) tocar na quadra seleciona e vale só para o próximo ponto; (c) tocar de novo desmarca; (d) quadra e líbero são exclusivos; (e) depois do side-out o atleta que gira para P1 aparece com "posição P1" e o selecionado continua o mesmo; (f) ace com atleta escolhido na quadra grava direto, sem barra.
- [ ] Implementar: dentro do grupo "Atleta envolvido no próximo ponto (opcional)", renderizar `RotationCourt` interativo e, se houver líbero, o botão (Chip) do líbero; remover o cartão lateral "Rotação atual" movendo para o cartão do ponto o texto "Saca agora…" / "O adversário saca…". Compacto no celular (uma linha por posição, sem papel visível).
- [ ] e2e: na auditoria responsiva, medir os botões da quadra (>= 44 px de altura) e checar rolagem horizontal; capturar a tela em 360 e 1280 px.
- [ ] `npx vitest run src/features/matches` e `npx playwright test --project=local matches` → PASS.

### Task 3: Documentação e verificação
- [ ] `docs/SCREEN_MAP.md` e `CLAUDE.md` (linha da coleta assistida): quadra clicável existe; revisão com vídeo ainda não.
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run test:e2e` → tudo passando; relatar o que foi simulado e o que foi navegador real. Não commitar.
