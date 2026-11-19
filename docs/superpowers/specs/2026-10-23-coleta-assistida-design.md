# Coleta assistida de estatísticas: registro mais rápido e revisão com vídeo

Data: 2026-10-23 · Estado: **desenho para revisão (nada implementado)** · Origem: conversa com o dono do projeto.

## 1. Objetivo e resultado esperado

Facilitar a marcação das estatísticas dos atletas, em jogo e em treino, **sem automatizar o que ainda não dá para automatizar com
segurança**. Duas partes independentes:

1. **Registro mais rápido** (partida ao vivo e treino): menos buscas e menos toques, mesmos dados e mesmas regras.
2. **Tela de revisão com vídeo**: tocar a gravação do jogo no computador, ver as trilhas de pessoas já geradas pelo serviço
   de análise (`services/video-analysis`), associar cada trilha a um atleta e usar o vídeo para detalhar pontos com calma.

Sucesso: o técnico registra um ponto de ace/erro de saque sem procurar o atleta; um treino de fundamento único é registrado com
1 toque por tentativa; depois do jogo, alguém consegue associar trilhas a atletas e detalhar pontos assistindo ao vídeo.

## 2. Fora do escopo (decisões já tomadas)

- **Sem fila de registros offline** com dados na nuvem (regra 15 do `CLAUDE.md`).
- **Sem criar ação técnica automaticamente** a partir do motivo do ponto: motivo e ação técnica são camadas separadas
  (regra 11) e criar só o saque do ace/erro tornaria a taxa enganosa (saques válidos nunca entrariam na conta).
- **Sem estatística gerada por IA**: o vídeo e as trilhas só ajudam uma pessoa a marcar; nada vai para as estatísticas sem
  confirmação humana.
- **Sem enviar vídeo à nuvem** nem guardá-lo em lugar nenhum: o arquivo é aberto do computador, na hora.
- **Sem tabela nova no banco** e sem migração. A associação trilha→atleta fica **só no navegador** (decisão do dono).
- **Sem detector de bola**, sem substituições/líbero automático, sem sugestão de eventos por IA (fases futuras).

## 3. Parte 1: registro mais rápido

### 3.1 Sugestão do sacador (partida ao vivo)
- Quando o Alpha7 está sacando e a pessoa toca em **"Ace"** ou em **"Erro de saque do Alpha7"** sem ter escolhido um atleta,
  o app **não grava ainda**: mostra uma barra "Ace de {Nome} #{n} (sacador)?" com **Confirmar**, **Outro atleta** e **Sem atleta**.
- Confirmar grava o ponto com `playerId = sacador` (o campo "atleta envolvido" que já existe). **Não cria ação técnica.**
- O sacador vem de `context.serverPlayerId` (calculado pelo domínio/servidor; nunca digitado). Se não houver sacador conhecido,
  nada muda no fluxo de hoje.
- Honestidade sobre ganho: a contagem de toques é parecida (tocar no motivo + confirmar, no lugar de escolher o atleta + tocar no motivo);
  o ganho é **não procurar o nome** e não esquecer de marcar. Se o atleta já foi escolhido antes, a barra não aparece.
- Regra de domínio: função pura `suggestedInvolved(reason, winner, context)` em `domain/match.ts` (ou arquivo vizinho)
  com testes que falham sem a regra: só sugere para `ace` (vencedor `us`, sacando `us`) e `erro_saque` (perdedor `us`, sacando `us`).

### 3.2 Atleta na quadra clicável
- `RotationCourt` passa a aceitar `onSelect`/`selectedId`: cada posição P1 a P6 vira botão (44 px, `aria-pressed`, nome acessível
  "Fulano #7, posição P2") que escolhe o atleta envolvido. A lista atual continua para líbero e reservas.
- Sem mudança de regra: usa o mesmo `involvedId` da tela.

### 3.3 Treino: rodízio e teclado
- **Rodízio**: opção "Passar para o próximo atleta a cada registro" (e "a cada N tentativas"), ordem pelo número da camisa entre os
  participantes. Cada tentativa continua sendo **um evento** com `attemptKey` próprio.
- **Teclado** (notebook/tablet): `1`..`4` escolhem o resultado, `←`/`→` trocam de atleta. Só vale com foco fora de campos de texto.
- Lógica do rodízio em função pura (`nextPlayerInRotation`) com testes.
- Nenhuma mudança no gateway nem no banco.

## 4. Parte 2: tela de revisão com vídeo

### 4.1 Rota e permissão
`/partidas/:matchId/revisao`, protegida por `matches:write` (só comissão técnica; sem capacidade nova, então a matriz de papéis
e o SQL não mudam). Link a partir do detalhe da partida. Não aparece para analista/leitor.

### 4.2 Entradas (tudo local)
- **Vídeo**: `<input type="file">` → `URL.createObjectURL` (revogado ao sair). Nunca é enviado a lugar nenhum.
- **JSON de análise** (`alpha7.video-analysis/1`): lido no navegador e **validado por inteiro antes de aceitar**, no estilo do
  `parseBackup`: reconstrói só os campos conhecidos, limita tamanho, rejeita o arquivo todo se algo falhar. As caixas são desenhadas
  num canvas sobre o vídeo, interpoladas entre quadros processados, a partir do `timestamp_ms` do vídeo original.
- Conferência de identidade do arquivo: `source.filename`/`size_bytes`/`duration_s` do JSON contra o vídeo aberto; divergência vira aviso (não bloqueio).

### 4.3 Associação trilha → atleta (só no navegador)
- Clicar numa caixa abre a escolha de atleta do **elenco**; "T4 = Fulano". Pode desfazer. Várias trilhas podem ser do mesmo atleta
  (o rastreador troca números); um atleta nunca aparece em duas caixas no mesmo quadro (aviso).
- **Armazenamento**: IndexedDB do navegador, chave `matchId + impressão do vídeo (nome, tamanho, data de modificação, duração)`.
  **Não entra no workspace nem no backup do app** (documentado em `DATA_SAFETY.md`: limpar dados do site apaga as associações).
  **Exportar/importar** um arquivo `alpha7.video-review/1` validado do mesmo jeito, para guardar ou levar a outro computador.
- Nada disto altera notas, Overall, escalações ou estatísticas.

### 4.4 Sincronizar com os pontos e detalhar
- A pessoa informa "o set N começa em mm:ss do vídeo" (um deslocamento); a lista de pontos da partida passa a ter **"ir para o vídeo"**.
- **Detalhar qualquer ponto** (não só o último) com as ações técnicas que já existem (`addRallyAction`), escolhendo atleta,
  fundamento e resultado vendo o vídeo; as trilhas associadas sugerem quem estava em quadra, mas **quem confirma é a pessoa**.
  Pré-requisito a verificar no plano: o gateway/funções SQL já aceitam ação em ponto antigo (a assinatura aceita `rallyId`); se
  houver restrição ao último ponto, é uma mudança de regra e exige migração própria (regra 11) — nesse caso, essa etapa vira proposta à parte.

## 5. Arquitetura e arquivos (previsão)

- `src/domain/`: `match.ts` (ou `matchSuggest.ts`): `suggestedInvolved`; `trainingRotation.ts`: `nextPlayerInRotation`;
  `videoReview.ts`: tipos, parser/validador do JSON de análise e do arquivo de revisão, interpolação de caixas, regras de
  associação. Tudo puro e testado (regra de dependência do projeto).
- `src/data/`: `reviewStore.ts` (IndexedDB, com interface substituível nos testes). Fora do `DataGateway` e do backup, de propósito.
- `src/features/matches/`: `MatchLivePage` (barra de sugestão), `RotationCourt` (clicável), `MatchReviewPage` + subcomponentes
  (player com canvas, painel de trilhas, lista de pontos).
- `src/features/trainings/TrainingRecordPage`: rodízio e atalhos.
- Rotas em `App.tsx` (carregada sob demanda, como as demais), item na lista de rotas do `e2e/responsive.spec.ts`.
- Sem dependência nova (HTML5 `video`, `canvas` e IndexedDB nativos).

## 6. Estados e acessibilidade
Carregando, vazio ("abra um vídeo e o JSON da análise"), erro com ação (arquivo inválido: lista o que falhou; vídeo sem
suporte do navegador: sugere converter), sucesso e confirmações. Foco visível, alvos de 44 px, contraste 4,5:1,
`prefers-reduced-motion` respeitado, tela de revisão utilizável de 360 a 1920 px (no celular, painel de trilhas abaixo do vídeo).
Nada anima o registro de pontos (regra 14).

## 7. Testes e verificação
- Unidade (`domain`): sugestão do sacador (casos que sugerem e que não sugerem), rodízio, parser/validador (arquivo válido,
  truncado, com campo a mais, JSON de outro esquema, tamanho excessivo), interpolação, associação sem duplicar atleta no quadro.
- Tela (Vitest + Testing Library): barra de sugestão (confirmar, outro atleta, sem atleta, falha de gravação), quadra clicável,
  rodízio no treino, teclado, página de revisão com store em memória.
- Navegador real (Playwright): revisão com um vídeo e um JSON **sintéticos** gerados nos testes; rota no teste de responsividade e
  na auditoria de acessibilidade. **Não prova** nada sobre vídeos reais do Alpha7 além do que o `amistoso1.mp4` já mostrou.
- Verificação manual com o `amistoso1.mp4` e o JSON `out/yolox_fluido/...` (só no computador do dono, sem copiar o vídeo).
- Tipos, build e `test:e2e` completos antes de cada entrega; **real vs simulado dito explicitamente** em cada relatório.

## 8. Riscos e como lidar
| Risco | Mitigação |
|---|---|
| Sugestão errada vira dado errado | só sugere com sacador conhecido; exige confirmação; desfazer anula (nunca edita) |
| Trilha trocada associada ao atleta errado | várias trilhas por atleta permitidas; aviso de duplicidade no quadro; nada vai às estatísticas sem a pessoa detalhar o ponto |
| Perder associações (dados só no navegador) | exportar/importar arquivo; aviso claro de onde ficam |
| JSON ou vídeo maliciosos/enormes | validação estrita e limites; vídeo só vira URL de objeto local; texto sempre escapado pelo React |
| Vídeo que o navegador não toca (codec `mp4v` do anotado) | a revisão usa o vídeo ORIGINAL do celular (H.264); aviso se não tocar |
| Detalhar ponto antigo exigir mudança de regra no banco | verificar no começo da etapa 5; se exigir, vira proposta separada com migração |

## 9. Entrega em etapas (cada uma com testes, tela verificada e docs; nada publicado sem pedido)
1. Sugestão do sacador + rodízio e atalhos no treino.
2. Quadra clicável.
3. Tela de revisão só leitura (vídeo + JSON + caixas).
4. Associação trilha→atleta (IndexedDB, exportar/importar) e sincronização com os pontos.
5. Detalhar qualquer ponto pela revisão.
Versão ao fim: 0.9.0, `docs/` atualizados (`DATA_SAFETY`, `SCREEN_MAP`, nova seção em `PRODUCT_SPEC`), `CLAUDE.md` com o estado real.
