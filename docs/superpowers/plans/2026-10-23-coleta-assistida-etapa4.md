# Coleta assistida, etapa 4 (associar trilhas a atletas e sincronizar com os pontos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela de revisão, associar cada trilha de pessoa a um atleta do elenco (guardado SÓ no navegador, com exportar e importar) e ligar a lista de pontos da partida ao instante do vídeo.

**Architecture:** Regras puras em `domain/videoReviewData.ts` (associação, duplicidade no mesmo quadro, sincronização por ponto de referência, arquivo de revisão estrito). Persistência atrás de uma interface (`data/reviewStore.ts`): IndexedDB no navegador e memória nos testes, **fora** do `DataGateway`, do workspace e do backup. `MatchReviewPage` ganha o seletor de atleta por trilha, o rótulo do atleta nas caixas, a lista de pontos com "Ir para o vídeo" e exportar/importar.

**Tech Stack:** React 19, TypeScript estrito, IndexedDB nativo, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-coleta-assistida-design.md` (seções 4.3 e 4.4, sem o "detalhar qualquer ponto", que é a etapa 5).

## Global Constraints
- **Nada vai para a nuvem, para o workspace ou para o backup do app.** As associações vivem só no IndexedDB deste navegador; guardar fora dele é só pelo arquivo exportado. Limpar os dados do site apaga as associações (dito na tela e em `DATA_SAFETY.md`).
- A associação **não altera** notas, Overall, escalações nem estatísticas; não cria ação técnica nem ponto.
- Trilha ≠ atleta: os números `T<n>` continuam temporários. **Várias trilhas podem ser do mesmo atleta** (o rastreador troca números); uma trilha só tem um atleta. Quando o mesmo atleta aparece em duas caixas ao mesmo tempo, a tela avisa.
- Chave de armazenamento = `matchId + impressão do vídeo (nome, tamanho, data de modificação) + id da análise`. As associações valem para **aquela análise**: uma nova análise do mesmo vídeo tem outros números de trilha e outro registro.
- Arquivo exportado `alpha7.video-review/1`, validado por inteiro na importação (estilo `parseBackup`); recusa outra partida e outra análise; ignora com aviso associações de atleta que já não existe ou trilha que não existe.
- IndexedDB indisponível (navegação privada) ou erro de gravação: a tela continua funcionando em memória e **avisa** que não está guardando, apontando o "Exportar".
- Sincronização: o horário de cada ponto é o do **toque no registro ao vivo** (depois da jogada). A pessoa marca "este ponto aconteceu agora no vídeo" em UM ponto de cada set; os demais pontos do set são calculados pela diferença entre os horários de registro. "Ir para o vídeo" leva 5 s antes do ponto. Sem referência, o botão fica desabilitado, dizendo por quê.
- Acessível (rótulos reais, `aria-pressed`, foco visível, alvos de 44 px, contraste 4,5:1), sem rolagem horizontal de 360 a 1920 px; nada anima o registro. Sem dependência nova. Sem `as` para silenciar erro. Não commitar sem pedido.

## Review Focus
- **Importar o arquivo errado** (outra partida, outra análise, JSON quebrado, tipos errados): recusa tudo, explica, não altera o que já está salvo.
- **Atleta que saiu do elenco** depois de associar: a associação some da tela sem quebrar e a contagem de ignoradas aparece na importação.
- **Ponto de referência desfeito** (anulado) depois de sincronizar: "Ir para o vídeo" fica desabilitado com explicação em vez de levar a um tempo errado.
- **IndexedDB que falha** (indisponível ou erro): sem exceção na tela, aviso claro, associações continuam em memória e exportáveis.
- **Trocar de vídeo ou de análise** com associações salvas: nunca aplica associações de outra análise/vídeo; trocar de partida não vaza para outra.

## Tasks

### Task 1: Domínio `videoReviewData` (e id da análise)
**Files:** Create `src/domain/videoReviewData.ts`, `src/domain/videoReviewData.test.ts`; Modify `src/domain/videoReview.ts` (+ `id` em `VideoAnalysis`), `src/domain/videoReview.test.ts`.
**Interfaces (Produces):**
- `VideoAnalysis.id: string` — impressão do conteúdo do texto lido (hash FNV-1a de 32 bits em hexadecimal + tamanho: `"3fa9c1d2-1109459"`); mesma entrada, mesmo id.
- `interface VideoFingerprint { name: string; size: number; lastModified: number }`
- `interface ReviewData { matchId: string; video: VideoFingerprint; analysisId: string; assignments: Record<number, string>; syncs: Record<number, { rallyId: string; videoMs: number }> }` (`assignments`: `trackId → playerId`; `syncs`: `setNumber → ponto de referência`)
- `emptyReview(matchId: string, video: VideoFingerprint, analysisId: string): ReviewData`
- `reviewKey(data: Pick<ReviewData, 'matchId' | 'video' | 'analysisId'>): string`
- `assignTrack(data: ReviewData, trackId: number, playerId: string | null): ReviewData` — imutável; `null` remove.
- `duplicatedAthletes(data: ReviewData, visibleTrackIds: readonly (number | null)[]): string[]` — ids de atleta associados a 2 ou mais trilhas visíveis ao mesmo tempo.
- `setSync(data, setNumber: number, ref: { rallyId: string; videoMs: number }): ReviewData` e `clearSync(data, setNumber)`.
- `syncedVideoMs(sync: { rallyId: string; videoMs: number } | undefined, activeRalliesOfSet: readonly Pick<Rally, 'id' | 'recordedAt'>[], target: Pick<Rally, 'recordedAt'>): number | null` — `null` sem referência, ou referência fora dos pontos ativos; senão `videoMs + (target.recordedAt − ref.recordedAt)`.
- `referenceVideoMs(nowVideoMs: number, ...)` não existe: marcar usa `{ rallyId, videoMs: nowVideoMs }` direto.
- `LEAD_IN_MS = 5000` e `seekTarget(videoMs: number): number` (= `max(0, videoMs - LEAD_IN_MS)`).
- `serializeReview(data: ReviewData, now: Date): string` e `parseReviewFile(text: string, context: { matchId: string; analysisId: string; trackIds: ReadonlySet<number>; playerIds: ReadonlySet<string>; rallyIds: ReadonlySet<string> }): { ok: true; value: Pick<ReviewData, 'assignments' | 'syncs'>; ignored: number } | { ok: false; problems: string[] }`
- [ ] Testes (falham primeiro): id da análise estável e sensível a mudança; `assignTrack` (associa, troca, remove, não altera a original); duas trilhas do mesmo atleta permitidas; `duplicatedAthletes` (um atleta em 2 caixas visíveis; trilha sem atleta e `null` ignorados; mesmo atleta em trilhas não simultâneas não conta); `syncedVideoMs` (referência no meio do set, antes, depois; referência anulada → `null`; sem sync → `null`); `seekTarget` não passa de 0; `serializeReview` → `parseReviewFile` ida e volta; `parseReviewFile` recusa: não é JSON, esquema errado, outra partida, outra análise, tipo errado, duplicata de `track_id`; ignora (e conta) trilha inexistente, atleta inexistente e referência inexistente; arquivo grande demais.
- [ ] Implementar com as assinaturas acima; `npx vitest run src/domain` → PASS.

### Task 2: Armazenamento `reviewStore`
**Files:** Create `src/data/reviewStore.ts`, `src/data/reviewStore.test.ts`.
**Interfaces (Produces):**
- `interface ReviewStore { readonly persistent: boolean; load(key: string): Promise<ReviewData | null>; save(key: string, data: ReviewData): Promise<void> }` (erro de gravação **rejeita**; a tela decide o aviso)
- `createMemoryReviewStore(): ReviewStore` (`persistent: false`) e `createIndexedDbReviewStore(): ReviewStore` (banco `alpha7-revisao`, loja `reviews`, chave = `reviewKey`); `getReviewStore(): ReviewStore` (IndexedDB se existir, senão memória) e `setReviewStoreForTests(store: ReviewStore | null): void`.
- Os dados lidos passam por validação de formato (`isReviewData`): registro corrompido vira `null`, nunca exceção.
- [ ] Testes: memória (salvar/ler/isolamento por chave, cópia defensiva); `isReviewData` recusa lixo; `getReviewStore` sem `indexedDB` devolve a de memória; troca para testes.
- [ ] A versão IndexedDB é verificada em Chrome real na Task 6 (não há `fake-indexeddb` e não se adiciona dependência).

### Task 3: Associação na tela (seletor, rótulo nas caixas, duplicidade, clique na caixa, persistência)
**Files:** Modify `src/features/matches/review/MatchReviewPage.tsx`, `.module.css`, `reviewCanvas.ts` (`drawBoxes` recebe `labelFor?: (trackId: number | null) => string`), `matchReview.test.tsx`.
**Consumes:** Task 1 e 2; `data.players`.
- [ ] Testes (falham primeiro): (a) com vídeo e análise, cada trilha ganha o seletor "Atleta da trilha T1" (opções: "Sem atleta" + elenco por camisa); escolher grava no store e o rótulo da trilha mostra o nome; (b) as caixas desenhadas usam o nome curto do atleta no rótulo (`fillText` com "Ana A. #1") e `T<n>` para quem não tem; (c) "Sem atleta" remove; (d) duas trilhas visíveis do mesmo atleta → aviso "{nome} está em duas caixas ao mesmo tempo"; (e) recarregar (nova renderização com o mesmo store) com o mesmo vídeo e a mesma análise restaura as associações; outro vídeo ou outra análise não restaura; (f) atleta que saiu do elenco: a trilha volta a "Sem atleta" sem erro; (g) store que falha ao salvar: a tela segue, mostra o aviso e as associações ficam em memória; (h) sem vídeo escolhido os seletores ficam desabilitados com a explicação; (i) clicar numa caixa pausa e leva o foco ao seletor daquela trilha; (j) trocar de partida não mostra associações da outra.
- [ ] Implementar: `ReviewData` em estado, carregado por `reviewKey` quando há vídeo + análise (cancelando respostas atrasadas); salvar a cada mudança (aviso persistente quando `store.persistent` é falso ou o salvar falha); impressão do vídeo = `{ name, size, lastModified }`; `labelFor` passado ao desenho; clique no palco com teste de acerto na caixa (ignora a faixa dos controles do vídeo).
- [ ] `npx vitest run src/features/matches/review` e `npx tsc --noEmit` → PASS.

### Task 4: Exportar e importar associações
**Files:** Modify `MatchReviewPage.tsx` e `.module.css`, `matchReview.test.tsx`.
- [ ] Testes (falham primeiro): exportar baixa `alpha7-revisao-<adversario>-<AAAA-MM-DD>.json` com o conteúdo de `serializeReview`; importar arquivo válido substitui as associações e sincronizações e mostra "N associações importadas" (e quantas foram ignoradas); importar de outra partida, de outra análise ou lixo mostra o motivo e **não altera nada**; importar sem vídeo e análise carregados explica que precisa abrir os dois antes.
- [ ] Implementar com `downloadTextFile` e `File.text()`; texto do botão "Exportar associações" e campo "Importar associações (.json)".

### Task 5: Lista de pontos e sincronização
**Files:** Modify `MatchReviewPage.tsx` e `.module.css`, `matchReview.test.tsx`.
**Consumes:** `data.matchSets`, `data.rallies`, `rallyDescription`, `runningScores`, `syncedVideoMs`, `seekTarget`, `setSync`, `clearSync`.
- [ ] Testes (falham primeiro): (a) lista os pontos ATIVOS por set com número, placar corrido e descrição, sem os anulados; (b) sem referência, "Ir para o vídeo" está desabilitado com o motivo ("Marque um ponto deste set no vídeo"); (c) "Marcar no instante atual" num ponto grava a referência do set com o `currentTime` do vídeo e habilita os demais; (d) "Ir para o vídeo" de outro ponto leva a `seekTarget(videoMs + diferença dos horários)`; (e) ponto de referência anulado depois → botões desabilitados com a explicação; (f) a referência persiste e vai no arquivo exportado e volta na importação; (g) partida sem pontos mostra o vazio com saída; (h) "Limpar referência do set".
- [ ] Implementar a seção "Pontos da partida" (um grupo por set, rolável), textos de ajuda sobre o horário do registro ao vivo.

### Task 6: Chrome real, conferência com o jogo real, documentação e relatório
- [ ] `e2e/review.spec.ts`: cria partida com pontos pelo app (registro ao vivo real), abre a revisão com vídeo e análise sintéticos, associa uma trilha, **recarrega a página** e reabre os mesmos arquivos: a associação volta (IndexedDB real); exporta (evento de download) e importa em outro contexto; marca a referência de um ponto, usa "Ir para o vídeo" e confere o `currentTime`; larguras de 360, 390 e 1280 px com rolagem, alvos de 44 px e axe.
- [ ] Conferência visual com o `amistoso1.mp4` e a análise real (só no computador do dono): associar uma trilha, ver o nome na caixa, recarregar e reabrir. Registrar o que se viu e o que não deu para ver.
- [ ] `docs/SCREEN_MAP.md` (tela 09 atualizada), `docs/DATA_SAFETY.md` (onde ficam as associações e como perder/guardar), `CLAUDE.md` (estado real das etapas 1 a 4).
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run test:e2e` → tudo passando; dizer o que foi simulado, o que foi Chrome real e o que não foi testado. Não commitar.
