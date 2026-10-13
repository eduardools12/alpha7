# Alpha7 Volleyball Performance

Aplicação web de gestão esportiva e análise de desempenho para uma equipe amadora de voleibol. Produto real, em evolução incremental por módulos. Versão atual: **0.3.1** (v0.1 = elenco, avaliações e escalações; v0.2 = módulo de Treinos; v0.3 = proteção dos dados: backup, importação segura, cópia automática; 0.3.1 = inicialização e recuperação seguras: nunca cria demonstração sozinha). A versão vive em `src/version.ts` e deve ser igual à do `package.json` (há teste).

## Estado atual (não declare como pronto o que está só planejado)

| Módulo | Estado |
|---|---|
| Shell, navegação, identidade visual | Implementado |
| Dashboard | Implementado. Elenco, Overall, treinos concluídos e último treino são reais (derivados de avaliações e treinos); **apenas partidas e próxima partida** são dados de demonstração |
| Elenco: cartas, busca, filtros, cadastro, edição, perfil | Implementado |
| Atributos (1 a 99), avaliações com histórico, Overall por posição, pesos configuráveis | Implementado |
| Escalação: editor com 6 titulares, líbero, reservas, ordem de saque, prévia de rodízio, salvar/listar | Implementado (regras parciais, veja `docs/PRODUCT_SPEC.md`) |
| Treinos: lista, criar/editar/excluir, participantes, exercícios, registro rápido por fundamento com desfazer, resumo pós-treino com estatísticas | Implementado (v0.2). Critérios de resultado e limite de amostra são **decisões iniciais a validar** (`docs/METRICS.md`, seção C) |
| Perfil do atleta: métricas observadas (de treinos) | Implementado; as de partida seguem indisponíveis |
| Partidas, Estatísticas consolidadas | **Não implementadas**: telas honestas de "em desenvolvimento" |
| Gerador de artes (pôster da escalação) | **Não implementado**: botão desativado |
| Proteção dos dados (v0.3): exportar/importar backup JSON validado, cópia automática com desfazer, confirmação reforçada, verificar integridade, lembrete, recuperação de dado ilegível | Implementado. Auditoria e riscos: `docs/DATA_SAFETY.md` |
| Backend (Supabase), autenticação, upload de fotos | **Não implementados**: persistência em `localStorage` (um navegador, sem nuvem; o backup em arquivo é a proteção) |

## Stack

React 19, TypeScript estrito, Vite, React Router, Recharts (carregado sob demanda), CSS com tokens (variáveis CSS + CSS Modules, sem Tailwind), Vitest + Testing Library (unidade e telas), Playwright (navegador real, usa o Chrome instalado). Fontes locais via Fontsource: Inter (interface) e Barlow Condensed (números e nomes de carta).

## Comandos

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm test             # Vitest (unidade + telas em jsdom)
npm run test:e2e     # Playwright em Chrome real (responsividade e fluxos); sobe o servidor sozinho
npm run build        # typecheck + build de produção
```

Antes de dar uma tarefa por concluída: `typecheck`, `test` e `build` precisam passar de verdade. Para mudanças de layout ou fluxo, rode também `test:e2e` e **olhe a tela** (Playwright MCP ou painel do navegador).

## Estrutura

```
src/
  domain/       Regras de negócio PURAS (sem React, sem I/O): atributos, Overall, jogador,
                filtro do elenco, escalação, métricas, insights, formatação, fundamentos e
                resultados (fundamentals), treinos e eventos (training), estatísticas de treino
                (trainingStats). Tudo testado.
  data/         Persistência e estado: contrato DataGateway, LocalStorageGateway, dados de
                demonstração, WorkspaceProvider (store em contexto), selectors.
  components/   ui/ (botão, campo, aviso...), brand/ (logo, carta, camisa, Overall), charts/
  features/     dashboard, roster, lineup, trainings, settings, placeholders (uma pasta por módulo)
  app/          App/rotas, layout, menus, efeitos de rota
  styles/       tokens.css (sistema de design) e base.css
  test/         setup, fábricas e renderApp (helper de testes de tela)
e2e/            Testes Playwright
public/brand/   Logo A7 derivado (PNG transparente) e original/ (arquivos oficiais intactos)
design/         Referências visuais e arquivos oficiais da marca (NÃO modificar)
docs/           Especificação, design system, mapa de telas, modelo de dados, métricas
```

Regra de dependência: `domain` não importa nada de fora de `domain`. `data` importa `domain`. `features`/`components` importam `domain` e `data`. Nunca ponha regra de negócio em componente nem I/O no domínio.

## Convenções de código

- TypeScript estrito (`noUncheckedIndexedAccess`, `noUnused*`, `verbatimModuleSyntax`). Sem `any`; sem `as` para silenciar erro.
- Alias `@/` aponta para `src/`.
- Componentes pequenos, um arquivo + um `.module.css` por componente. Estilo só com tokens (`var(--...)`), nunca cores soltas (exceção: SVG de gráficos, que não lê CSS).
- Textos da interface em português do Brasil, frase com inicial maiúscula, voz ativa. Botão diz o que faz ("Salvar avaliação"); a mesma ação mantém o nome em todo o fluxo. Erro diz o que houve e como corrigir; vazio convida a agir.
- Dados e datas: datas de domínio são texto `AAAA-MM-DD` (sem fuso). Registros criados pela pessoa têm `demo: false`; os de demonstração, `demo: true`.
- Dados imutáveis no domínio: funções devolvem cópias.
- Escreva arquivos com UTF-8 sem BOM (no PowerShell 5.1, `Set-Content -Encoding utf8` adiciona BOM e `>` pode corromper acentos: prefira a ferramenta de escrita do editor).
- TypeScript 7: `baseUrl` não existe mais; use `paths` com `./`.

## Regras de negócio que não podem ser violadas

1. **Cadastro é independente de avaliação.** Editar o jogador não altera notas.
2. **Atributos são avaliações, estatísticas são registros observados.** Resultado de jogo nunca muda nota sozinho.
3. **Overall é derivado, nunca armazenado.** É média ponderada pelos pesos da posição principal (`domain/overall.ts`), sempre explicável (`explainOverall`). Pesos são provisórios.
4. **Histórico de avaliações só cresce.** Nova avaliação = novo registro datado.
5. **Ausência de dado não é zero.** Sem avaliação, Overall é `null` ("—"). Sem tentativas, métrica é indisponível, nunca 0%. Todo percentual vem com acertos e tentativas.
6. **Escalação nunca duplica atleta.** Escolher quem já está na escalação o move (ou troca de lugar). Líbero de ofício não ocupa zona de quadra. Diferencie posição habitual, posição tática e zona/rotação.
7. **Dados de demonstração são sempre identificados** (etiqueta "Demo" + faixa fixa) e nunca se apresentam como resultado real do Alpha7.
8. **Eventos de treino** (`TrainingEvent`): uma tentativa por evento, com `attemptKey` (idempotência: o mesmo envio nunca duplica). Só se cria evento com treino aberto, exercício DO treino e atleta participante (checado no domínio **e** no gateway). **Desfazer anula** (`voidedAt`), não apaga; toda estatística ignora anulados. Editar um treino nunca toca nos eventos; não se remove exercício com registros nem participante com registros válidos; excluir treino apaga em cascata só o que é dele.
9. **Estatística de treino sempre com tentativas e denominador**, usando as funções de `domain/trainingStats.ts` (fórmulas em `docs/METRICS.md`). Amostra com menos de `MIN_SAMPLE` (10) tentativas é sinalizada; comparação entre atletas só com 2 ou mais de amostra adequada. A qualidade do levantamento é indicador separado do resultado do ataque. Nunca escreva "conclusões" automáticas.
10. **Eventos de treino e de partida são coleções separadas** (a taxonomia de `domain/fundamentals.ts` é compartilhada). Registrar tentativas nunca altera avaliações (notas) nem Overall.

## Segurança

- Não existem segredos no repositório. Quando o Supabase for integrado: só a chave **anon/publicável** no frontend, via `VITE_*` em `.env.local` (ignorado pelo Git; modelo em `.env.example`). Chave `service_role` nunca vai ao frontend.
- Proteção real dos dados virá de RLS no Postgres (escopo por equipe), não de lógica no cliente.
- Dados do `localStorage` são tratados como não confiáveis: o gateway valida o formato e recusa dados corrompidos (guarda cópia de recuperação).
- **Proteção de dados (detalhes em `docs/DATA_SAFETY.md`):**
  - Toda substituição do workspace inteiro passa por `replaceWorkspace`, que guarda ANTES a cópia de segurança e aborta sem alterar nada se não conseguir. Nunca escreva em `alpha7.workspace.v1` por outro caminho.
  - **O gateway nunca cria dados sozinho.** `load()` falha com `WorkspaceMissingError` (primeira utilização ou perdido) ou `StorageCorruptedError`; quem decide é a pessoa (tela de escolha ou de recuperação). Não reintroduza semeadura automática nem "se não existir, cria". Gravar sem workspace é recusado. O `localStorage` não detecta toda perda: não afirme o contrário.
  - Nunca descarte dados do usuário em silêncio: ação destrutiva = painel de impacto + recomendação de backup + confirmação explícita + desfazer.
  - Importação nunca mescla nem aplica JSON bruto: `parseBackup` reconstrói cada objeto só com campos conhecidos e rejeita o arquivo inteiro se algo falhar. O checksum detecta corrupção, não adulteração.
  - Mudou o formato dos dados? Aditivo e opcional não exige nova versão; qualquer outra mudança exige nova versão de esquema/formato **e** migração em `MIGRATIONS` com teste usando arquivo v1 fixo. Atualize `src/version.ts` junto com `package.json`.
  - Toda nova coleção persistida entra em `Workspace`, no backup (`workspaceBody`), em `validateWorkspace`, em `summarizeWorkspace` e nos testes de ida e volta.
- Texto digitado é renderizado pelo React (escapado); nunca use `dangerouslySetInnerHTML`.
- Não adicione dependências sem justificar (o que resolve, por que não dá para fazer sem).

## Referências visuais

As 8 telas de referência estão em `design/references/` (mapeamento nome real para tela em `docs/SCREEN_MAP.md`). São **especificação de design, não assets**: nunca as use como imagem de fundo nem as embuta na aplicação. Recrie com componentes reais, dados dinâmicos e os tokens. As fotos de atletas dos mockups são imagens geradas e não são usadas (cartas usam camisa em SVG).

Logo e uniformes oficiais: use os arquivos originais. `public/brand/original/` guarda cópias idênticas; `a7-mark-{white,lilac,purple}.png` são derivados só com fundo transparente (nunca redesenhe o símbolo, nunca distorça). Os mockups têm erros de texto e inconsistências (listadas em `docs/DESIGN_SYSTEM.md`): não os copie.

## Critérios para toda nova funcionalidade

- Regra de negócio em `domain/` com testes que falham sem a regra (não só teste de renderização).
- Estados completos: carregando, vazio, erro (com ação de recuperação), sucesso e validação por campo com foco no primeiro erro.
- Nada de botão decorativo: se não funciona, não aparece como funcional (desativado com motivo ou página "em desenvolvimento").
- Acessível: rótulos reais em campos, nomes acessíveis, `aria-pressed`/`aria-current` onde cabe, foco visível, alvos de toque de 44px, contraste mínimo 4,5:1 para texto, `prefers-reduced-motion` respeitado.
- Responsivo de 360px a 1920px, sem rolagem horizontal (o `e2e/responsive.spec.ts` verifica; inclua a nova rota em `ROUTES`).
- Tipos, testes e build passam; documentação (`docs/`) atualizada sem declarar como implementado o que é plano.
- Troca de persistência: implemente `DataGateway` (`src/data/gateway.ts`); telas e domínio não mudam.
- Testes: `renderApp` grava o workspace inicial antes de abrir o app (`seed: false` simula o navegador sem dados); nos testes do gateway use `gatewayWith`. Nos testes de navegador, `e2e/fixtures.ts` passa pela escolha de primeira utilização; só `e2e/startup.spec.ts` usa `@playwright/test` direto.
- Ação que apaga ou substitui dados: nunca silenciosa; siga a regra de proteção de dados acima e teste cancelar, falha no meio e desfazer.
