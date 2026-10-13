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
| 06 | Registrar treino | `celular_alpha.jpg` | Celular 1536×2752 | **Não implementada** (rota "em desenvolvimento") |
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
/treinos  /partidas  /estatisticas   Em desenvolvimento
/configuracoes          Pesos do Overall, identidade, dados (#dados)
```

Menu lateral (≥ 960px) e barra inferior (< 960px; "Mais" abre Partidas, Estatísticas e Configurações).

## 01 · Dashboard (`/`)

**Objetivo:** visão rápida da equipe e atalhos.
**Componentes:** quatro indicadores (Atletas cadastrados e situação; Overall médio do elenco; Treinos realizados [Demo]; Partidas disputadas com aproveitamento [Demo]); Próxima partida [Demo]; Resumo do último treino [Demo] com presença e intensidade; Evolução da equipe (Overall médio por mês, real); Destaques individuais (maiores Overalls e maior evolução, reais); Atalhos rápidos.
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

## 06 · Registrar treino (celular; não implementado)

Objetivo: registrar fundamentos em quadra com um toque. Componentes previstos: progresso da sessão; seletor de atleta; abas de fundamentos; botões A/B/C/Erro (recepção), Ace/Válido/Erro (saque), Ponto/Erro/Bloqueado (ataque); últimos registros com desfazer; contador de tentativas. Rota atual `/treinos` informa o que está planejado.

## 07 · Estatísticas (não implementado)

Objetivo: analisar desempenho. Previstos: taxa de ace, eficiência de ataque, sucesso no side-out e eficiência de bloqueio (cada um com "x de y"); evolução dos treinos; qualidade de recepção empilhada; comparação de atacantes; exportar relatório. Fórmulas em `METRICS.md`. Rota atual `/estatisticas` informa o plano.

## 08 · Central de partidas (celular; não implementado)

Objetivo: conduzir o placar de uma partida. Previstos: placar do set com saque e rotação; botões de ponto com origem (ace, ataque, bloqueio, erro adversário) e atleta envolvido; substituição; ver escalação e rotação; desfazer ponto; últimos rallies. Rota atual `/partidas` informa o plano.

## Telas não presentes nas referências

`/configuracoes` (pesos do Overall, identidade da equipe com logo e uniformes oficiais, gerenciar dados), `/escalacoes` (lista), cadastro/edição/avaliação de atleta e a página de não encontrado. Seguem os mesmos padrões do sistema de design.
