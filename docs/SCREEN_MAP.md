# Mapa de telas

## Arquivos de referência

Os arquivos reais em `design/references/` não seguem a numeração `01-` a `08-` do brief. Todos os oito estão presentes; nenhum faltou. Foram examinados visualmente um a um.

| # | Tela | Arquivo real | Formato | Estado na v0.1 |
|---|---|---|---|---|
| 01 | Dashboard | `dashboard_alpha.jpg` | Desktop 2752×1536 | Implementada (parcial: treinos e partidas em demonstração) |
| 02 | Elenco | `elenco_alpha.jpg` | Desktop 2592×1664 | Implementada |
| 03 | Perfil do atleta | `atleta_alpha.jpg` | Desktop 2464×1728 | Implementada |
| 04 | Editor de escalação | `formacao_alpha.jpg` | Desktop 2464×1728 | Implementada (sem gerar arte) |
| 05 | Pôster da escalação | `midia_alpha.jpg` | Retrato 1856×2304 | **Não implementada** |
| 06 | Registrar treino | `celular_alpha.jpg` | Celular 1536×2752 | Implementada (v0.2), também no desktop |
| 07 | Estatísticas | `stats_alpha.jpg` | Desktop 2752×1536 | **Não implementada** (rota "em desenvolvimento") |
| 08 | Central de partidas | `cell_alpha.jpg` | Celular 1536×2752 | **Não implementada** (rota "em desenvolvimento") |

Identidade: `design/assets/a7 logo.jpeg` (logo), `a7 branco.jpeg` (uniforme branco com detalhes roxos), `a7 roxo.jpeg` (uniforme roxo com detalhes brancos). Preservados sem alteração.

As referências são especificação, não assets. Diferenças deliberadas: `DESIGN_SYSTEM.md`, seção 10.

## Rotas e navegação

```
/                       Dashboard
/elenco                 Elenco  ── /elenco/novo (cadastro)
  /elenco/:id           Perfil  ── /elenco/:id/editar
                                 └ /elenco/:id/avaliar (registrar avaliação)
/escalacoes             Lista de escalações ── /escalacoes/nova, /escalacoes/:id (editor)
/treinos                Lista de treinos ── /treinos/novo (criar)
  /treinos/:id          Resumo pós-treino ── /treinos/:id/editar
                                            └ /treinos/:id/registrar (registro rápido)
/partidas  /estatisticas   Em desenvolvimento
/configuracoes          Backup (#backup), dados e armazenamento (#dados), pesos do Overall, identidade
```

Menu lateral (≥ 960px) e barra inferior (< 960px; "Mais" abre Partidas, Estatísticas e Configurações).

## 01 · Dashboard (`/`)

**Objetivo:** visão rápida da equipe e atalhos.
**Componentes:** quatro indicadores (Atletas cadastrados e situação; Overall médio do elenco; Treinos concluídos, **real**, com contagem de registros; Partidas disputadas com aproveitamento [Demo]); Próxima partida [Demo]; Resumo do último treino (real, a partir dos treinos cadastrados: nome, data, participantes, exercícios e registros, com atalho ao resumo); Evolução da equipe (Overall médio por mês, real); Destaques individuais (maiores Overalls e maior evolução, reais); Atalhos rápidos.
**Ações:** Ver escalações, links para perfil, Adicionar jogador, Montar escalação, Ver elenco.
**Estados:** vazio total (convida a cadastrar), sem avaliações (Overall médio "—"), sem atividade (traços e "Sem registros").
**Não incluído (decisão):** seletor de período, "Novo Registro", usuário/sair.

## 02 · Elenco (`/elenco`)

**Objetivo:** conhecer e encontrar atletas.
**Componentes:** título com contagem ("6 de 18 jogadores" quando filtrado); busca por nome ou número; chips de posição (principal) e de situação; grade de cartas.
**Ações:** buscar, filtrar (ficam na URL), abrir perfil, Adicionar jogador.
**Estados:** elenco vazio, nenhum resultado (com "Limpar filtros"), atleta sem avaliação ("Sem avaliação", escudo "—").

## 03 · Perfil do atleta (`/elenco/:id`)

**Objetivo:** ver e acompanhar um atleta.
**Componentes:** herói (camisa, nome, número, posições, situação, Overall grande); Avaliação de atributos (9 barras em dois grupos); Evolução do Overall (gráfico a partir de 2 avaliações) com variação; Métricas reais de partidas e treinos (indisponíveis, "—"); Análise técnica (maiores e menores atributos); Como o Overall foi calculado (tabela nota × peso = pontos); Histórico de avaliações; Observações do treinador.
**Ações:** Editar perfil, Registrar avaliação, Voltar ao elenco.
**Estados:** atleta não encontrado; sem avaliação (convite para avaliar); uma só avaliação (sem gráfico); confirmação após salvar.

### Subtelas
- **Cadastro/edição** (`/elenco/novo`, `/elenco/:id/editar`): dados do atleta; no cadastro, avaliação inicial opcional com prévia do Overall.
- **Registrar avaliação** (`/elenco/:id/avaliar`): data, avaliador, observação, nove notas (campo + controle deslizante), prévia do Overall e da variação.

## 04 · Montar escalação (`/escalacoes/nova`, `/escalacoes/:id`)

**Objetivo:** definir seis titulares, líbero e reservas para um jogo.
**Componentes:** dados do jogo (nome, adversário, campeonato, data e hora, local, formação 5-1/4-2/6-2); quadra com zonas P1 a P6 e vaga de líbero; Painel de jogadores com abas Titulares (escolher para a zona selecionada, papel tático, ordem de saque base) e Reservas; prévia do rodízio; revisão (erros que impedem salvar e avisos que não impedem).
**Ações:** selecionar zona, escolher atleta (move ou troca, nunca duplica), remover da zona, trocar papel tático, definir líbero, marcar reservas, girar prévia, salvar. **Gerar arte** aparece desativado ("em breve").
**Lista** (`/escalacoes`): cartões com formação, titulares, reservas e líbero; abrir; excluir com confirmação.

## 05 · Pôster da escalação (não implementado)

Arte vertical gerada de uma escalação salva (título "Escalação oficial", confronto, local, seis titulares na quadra, líbero, reservas). Depende do gerador de artes (próxima etapa de mídia). Nada a navegar ainda. Quando existir: gerar a partir de `/escalacoes/:id`, exportar imagem, sem fotos de terceiros.

## 06 · Registrar treino (`/treinos/:id/registrar`, celular primeiro)

**Objetivo:** registrar tentativas em quadra com um toque, pelo celular, sem digitar.
**Fluxo:** (treino já escolhido ao abrir a tela) → exercício atual → jogador → fundamento → toque no resultado. Depois de cada registro, jogador, exercício e fundamento permanecem selecionados.
**Componentes:** listas horizontais de exercícios, jogadores (camisa em SVG, nome curto e quantos registros já tem neste treino) e fundamentos (6); painel de resultado com botões grandes coloridos pelo tom do resultado (verde, azul-violeta, laranja, vermelho, neutro) e subtítulo curto; contador de tentativas do jogador naquele fundamento e exercício, com a divisão por resultado; critérios de cada resultado (recolhível); faixa de feedback ("Registrado: Gabriel S. #8 · Recepção A") que some sozinha; últimos 6 registros com horário; "Desfazer último registro"; atalho ao resumo.
**Ações:** escolher, registrar (um toque = uma tentativa), desfazer (anula só o último, por id), reabrir treino concluído.
**Comportamento no celular:** depois de escolher o jogador o painel de resultado fica fixo acima da barra inferior (sempre ao alcance do polegar), baixo o bastante para não cobrir as listas; antes disso segue o fluxo normal. Botões de pelo menos 56 px de altura; bloqueio de 350 ms após cada toque contra duplo toque acidental.
**Estados:** treino concluído (aviso e botão "Reabrir para registrar"), sem exercícios, sem participantes, treino inexistente, falha de gravação (aviso, nada é registrado, botões voltam).
**Diferenças em relação à referência:** sem "Sessão 65% concluída" (não há meta de tentativas planejada), sem o contador "+1 / −1" nem o botão "Registrar ação" (cada resultado já registra com um toque, e o desfazer cobre o erro), sem fotos dos atletas (camisa em SVG), duas ações "Desfazer" do mockup viraram uma só, que desfaz sempre o último registro válido do treino.

## 06b · Lista, criação/edição e resumo de treinos (telas novas, sem referência própria)

- **Lista** (`/treinos`): cartões do mais recente ao mais antigo com status (Em andamento / Concluído), etiqueta Demo, data, duração, responsável, participantes, exercícios e registros; Registrar (só se em andamento), Resumo, Editar, Excluir com confirmação que informa a cascata; aviso de que os dados são locais.
- **Criar/editar** (`/treinos/novo`, `/treinos/:id/editar`): nome, data, duração, responsável, descrição, observações; participantes do elenco (ativos pré-selecionados no novo treino); exercícios (nome e fundamento em foco). Na edição, exercício ou participante com registros fica bloqueado para remoção, com o motivo.
- **Resumo** (`/treinos/:id`): identificação, números do treino, participantes, **estatísticas por fundamento** (distribuição, indicadores com fórmula e denominador, aviso de amostra insuficiente), exercícios com registros, **resultados individuais** com escolha de fundamento e comparação só quando há base, observações do responsável, concluir/reabrir, excluir. Fundamentos sem tentativas aparecem listados como "sem tentativas", sem cartão de zeros.

## 07 · Estatísticas (não implementado)

Objetivo: analisar desempenho. Previstos: taxa de ace, eficiência de ataque, sucesso no side-out e eficiência de bloqueio (cada um com "x de y"); evolução dos treinos; qualidade de recepção empilhada; comparação de atacantes; exportar relatório. Fórmulas em `METRICS.md`. Rota atual `/estatisticas` informa o plano.

## 08 · Central de partidas (celular; não implementado)

Objetivo: conduzir o placar de uma partida. Previstos: placar do set com saque e rotação; botões de ponto com origem (ace, ataque, bloqueio, erro adversário) e atleta envolvido; substituição; ver escalação e rotação; desfazer ponto; últimos rallies. Rota atual `/partidas` informa o plano.

## Telas não presentes nas referências

`/configuracoes` (ver abaixo), `/escalacoes` (lista), cadastro/edição/avaliação de atleta e a página de não encontrado. Seguem os mesmos padrões do sistema de design.

### `/configuracoes` (v0.3), de cima para baixo

1. **Backup** (`#backup`): "Exportar backup" (baixa `alpha7-backup-AAAA-MM-DD-HHmm.json`; mostra sucesso ou o motivo da recusa, com opção de baixar a cópia bruta) e "Arquivo de backup (.json)" para restaurar. Arquivo recusado: lista de problemas e "Nada foi alterado". Arquivo válido: **prévia** Backup × Atual, aviso de que restaurar substitui tudo, "Exportar backup do workspace atual", caixa "Entendi…" (só quando há dados da equipe), "Restaurar este backup" e "Cancelar".
2. **Dados e armazenamento** (`#dados`): onde os dados ficam, resumo do que há (com a parte de demonstração), proteção e uso do armazenamento (aviso a 70%), "Verificar integridade dos dados", cópia de segurança da última substituição com "Desfazer última substituição", e "Restaurar dados de demonstração" / "Apagar todos os dados" com painel de impacto e confirmação.
3. Pesos do Overall.
4. Identidade da equipe (logo e uniformes oficiais).

Antes de qualquer rota, quando não há workspace utilizável, o layout mostra no lugar da página: **"Como você quer começar?"** (primeira utilização: workspace vazio, dados de demonstração ou restaurar de um backup; nada é gravado antes da escolha) ou **"Recuperar os dados da equipe"** (workspace ausente com rastros de uso anterior, ou dado ilegível: importar backup, restaurar a cópia automática, baixar dados brutos, tentar novamente e começar um workspace novo só após confirmação). Ver DATA_SAFETY.md, seção 7.

Em todas as telas: faixa **"Faça um backup dos dados da equipe"** (com link para `#backup`) quando há dados reais sem backup recente; a faixa de demonstração também avisa quando o armazenamento do navegador está indisponível; se os dados salvos estiverem ilegíveis, a tela de recuperação explica que nada foi apagado e oferece as saídas acima. A faixa de demonstração vira "Demonstração misturada com dados da equipe" quando há registros fictícios e reais juntos, e uma faixa avisa quando a validação estrita achou inconsistências nos dados abertos.
