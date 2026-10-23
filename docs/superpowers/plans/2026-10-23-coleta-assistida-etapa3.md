# Coleta assistida, etapa 3 (revisão com vídeo, só leitura) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/partidas/:matchId/revisao` que toca o vídeo do jogo (arquivo local) e desenha por cima as caixas e os números de trilha do JSON gerado por `services/video-analysis`. Só leitura: sem associar atletas (etapa 4) e sem gravar nada.

**Architecture:** Regras puras em `domain/videoReview.ts` (leitor estrito do JSON `alpha7.video-analysis/1`, caixas interpoladas no tempo, conferência vídeo x análise). A página lê os dois arquivos no navegador (`URL.createObjectURL` para o vídeo, `File.text()` para o JSON), desenha num canvas sobre o `<video>` e lista as trilhas. Nenhum dado sai do computador e nada é gravado (nem no workspace, nem no backup, nem no IndexedDB nesta etapa).

**Tech Stack:** React 19, TypeScript estrito, HTML5 video/canvas, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-coleta-assistida-design.md` (seções 4.1 e 4.2).

## Global Constraints
- **O vídeo nunca é enviado a lugar nenhum**: só `URL.createObjectURL`, revogada ao trocar de arquivo e ao sair da tela.
- JSON validado **por inteiro** antes de aceitar (estilo `parseBackup`): reconstrói só os campos conhecidos, rejeita o arquivo todo se algo falhar e lista até 8 problemas. Limites: texto até 64 MB, até 200 000 quadros, até 300 detecções por quadro, até 5 000 trilhas.
- Texto vindo do arquivo (nome do vídeo etc.) é sempre renderizado pelo React; nada de `dangerouslySetInnerHTML`.
- Permissão `matches:write` (a mesma de acompanhar a partida: comissão técnica e analista); rota protegida; sem capacidade nova, então matriz de papéis e SQL não mudam.
- Os números `T<n>` são **temporários do rastreador e não identificam atletas**: a tela diz isso.
- Estados: vazio, carregando, erro com ação, sucesso. Acessível (rótulos reais, foco visível, alvos de 44 px, contraste 4,5:1), sem rolagem horizontal de 360 a 1920 px, `prefers-reduced-motion` respeitado, nada animado.
- Sem dependência nova. Sem `as` para silenciar erro. Não commitar sem pedido.

## Review Focus
- **JSON inválido de formas diferentes** (não é JSON, esquema de outra versão, campo de tipo errado, confiança fora de 0..1, tempo que volta, arquivo gigante): rejeita tudo, mostra o motivo, não carrega nada.
- **Análise de outro vídeo** (duração/resolução/tamanho diferentes): aviso claro, sem bloquear; as caixas escalam pela resolução da análise.
- **Tempo fora do trecho analisado** (análise de 60 s num vídeo de 84 s): sem caixas, sem erro.
- **Vídeo que o navegador não toca**: mensagem com saída (converter para MP4/H.264); a análise continua listada.
- **Trocar ou remover arquivos** repetidamente: sem vazamento de URL e sem estado antigo na tela.

## Tasks

### Task 1: Domínio `videoReview`
**Files:** Create `src/domain/videoReview.ts`, `src/domain/videoReview.test.ts`.
**Interfaces (Produces):**
- `type TrackBox = { trackId: number | null; bbox: readonly [number, number, number, number]; confidence: number }`
- `interface VideoAnalysis { source: { filename: string; sizeBytes: number | null; width: number; height: number; fps: number; durationS: number | null }; frames: { timestampMs: number; boxes: TrackBox[] }[]; tracks: { trackId: number; firstMs: number; lastMs: number; detections: number }[]; analyzedFromMs: number; analyzedToMs: number }`
- `parseVideoAnalysis(text: string): { ok: true; value: VideoAnalysis } | { ok: false; problems: string[] }`
- `boxesAt(analysis: VideoAnalysis, timeMs: number): TrackBox[]` — interpola entre os dois quadros vizinhos (mesma trilha: reta; só num lado: aparece até a metade; sem trilha: acompanha o lado mais próximo); antes de `analyzedFromMs` devolve `[]`; depois do último quadro mantém o último por até 1 s; buraco de mais de 1 s entre quadros mantém o anterior por 400 ms.
- `compareWithVideo(source: VideoAnalysis['source'], video: { name: string; sizeBytes: number; durationS: number | null; width: number; height: number }): string[]` — avisos em português (duração difere em mais de 1 s; resolução diferente; proporção diferente; tamanho diferente), vazio quando bate.
- `formatMs(ms: number): string` — `"1:05"` / `"1:02:03"`.
- `isWithinAnalysis(analysis, timeMs): boolean` — dentro do trecho analisado (com 1 s de folga depois do último quadro); a tela usa para avisar "fora do trecho analisado" (acrescentado ao ver o vídeo real: sem esse aviso, quem revisa podia achar que a análise falhou).
- [ ] Testes (falham primeiro): arquivo válido mínimo (2 quadros, 1 trilha); `schema_version` errado; não é JSON; raiz não-objeto; campo faltando; confiança 1,2; bbox com 3 números ou `NaN`; tempo que diminui; trilha citada em detecção e inexistente em `tracks`; excesso de quadros/detecções (via limites injetáveis em opções do parser, para testar sem criar 64 MB); texto acima do limite; campo desconhecido é ignorado (não passa adiante); `boxesAt` no meio de dois quadros interpola, antes/depois do trecho devolve `[]`, só-um-lado e sem-trilha; `compareWithVideo` com e sem divergência; `formatMs`.
- [ ] Implementar com as assinaturas acima; `npx vitest run src/domain/videoReview.test.ts` → PASS.

### Task 2: Tela de revisão
**Files:** Create `src/features/matches/review/MatchReviewPage.tsx`, `MatchReviewPage.module.css`, `reviewCanvas.ts` (função `drawBoxes(ctx, boxes, scale)`), `matchReview.test.tsx`; Modify `src/app/routes.ts` (`reviewMatch(id)` = `/partidas/:id/revisao`), `src/app/App.tsx` (rota lazy sob `RequireCapability matches:write`), `src/features/matches/MatchDetailPage.tsx` (botão "Revisar com vídeo" para quem pode escrever).
**Consumes:** `parseVideoAnalysis`, `boxesAt`, `compareWithVideo`, `formatMs`.
- [ ] Testes de tela (falham primeiro; `URL.createObjectURL` e `canvas.getContext` simulados): (a) estado vazio explica que nada sobe para a nuvem e pede vídeo e análise; (b) JSON válido → resumo do arquivo (nome, resolução, quadros, trilhas) e lista de trilhas com tempo inicial e final, sem prometer identidade; (c) JSON inválido → lista de problemas e nada é carregado; (d) análise de outro vídeo → aviso (sem bloquear); (e) erro de reprodução do vídeo → mensagem com saída e a análise continua listada; (f) clicar numa trilha leva o vídeo ao início dela (`currentTime`); (g) velocidade altera `playbackRate`; (h) passos de quadro mudam `currentTime` em 1/fps; (i) trocar o vídeo revoga a URL antiga e desmontar revoga a atual; (j) partida inexistente mostra o estado de erro com saída; (k) papel sem `matches:write` é barrado (teste remoto).
- [ ] Implementar: duas entradas de arquivo rotuladas ("Vídeo do jogo", "Análise (.json)"), palco com `<video controls>` + `<canvas aria-hidden>` sobreposto (tamanho pelo `ResizeObserver`; desenho em `requestVideoFrameCallback` quando existe, senão `requestAnimationFrame` enquanto toca, mais `seeked`/`loadedmetadata`/`resize`), controles de velocidade (0,25x/0,5x/1x/2x) e de quadro anterior/seguinte, caixa "Mostrar caixas", painel de trilhas e de avisos. Texto fixo: "Os números T<n> são temporários do rastreador e não identificam atletas."
- [ ] `npx vitest run src/features/matches/review` e `npx tsc --noEmit` → PASS.

### Task 3: Navegador real
**Files:** Create `e2e/review.spec.ts`; Modify `e2e/responsive.spec.ts` (nada: a rota depende de uma partida; o próprio `review.spec.ts` cobre larguras).
- [ ] O teste gera **no Chrome** um vídeo WebM sintético de 2 s (canvas + `MediaRecorder`), grava-o em arquivo temporário e cria um JSON sintético coerente; cria uma partida pela interface, abre `/partidas/:id/revisao`, carrega os dois arquivos, vai a um instante com caixas e confere que o canvas tem pixels desenhados e que o vídeo tocou; repete em 360, 390 e 1280 px conferindo rolagem horizontal, alvos de 44 px e auditoria axe. Real = Chrome; **o vídeo e o JSON são sintéticos** (não provam nada sobre o `amistoso1.mp4`).
- [ ] `npx playwright test --project=local review` → PASS; captura de tela para olhar.

### Task 4: Verificação manual com o vídeo real, documentação e relatório
- [ ] Com o `amistoso1.mp4` e `services/video-analysis/out/yolox_fluido/amistoso1.analysis.json` (só no computador do dono), abrir a tela no navegador do app e conferir o desenho das caixas contra o vídeo; registrar o que se viu (e o que não deu para ver). Não copiar o vídeo para o projeto.
- [ ] `docs/SCREEN_MAP.md` (tela 09), `docs/DATA_SAFETY.md` (o vídeo não sai do aparelho; JSON validado; nada gravado), `CLAUDE.md` (estado real da etapa 3).
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run test:e2e` → tudo passando; dizer o que foi simulado, o que foi Chrome real e o que não foi testado. Não commitar.
