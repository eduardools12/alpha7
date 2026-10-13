# Métricas e fórmulas

Três categorias: **A. Definidas e implementadas**, **B. Definidas e ainda não implementadas** (dependem de partidas) e **C. Decisões iniciais que precisam de validação** com a comissão técnica.

## Princípios

1. **Nota técnica ≠ estatística.** Atributos são avaliações do treinador (1 a 99). Estatísticas são contagens de eventos observados (treinos, no futuro partidas). Uma nunca altera a outra automaticamente: registrar tentativas não muda notas nem Overall.
2. **Ausência de dado não é zero.** Sem avaliação → Overall indisponível (`null`, exibido "—"). Sem tentativas → métrica indisponível, nunca 0%. 0% só existe com tentativas registradas e nenhum acerto (ex.: "0 de 12").
3. **Percentual sempre com contexto:** "16,1% (25 de 155)".
4. **Uma tentativa conta uma vez.** Cada toque gera um evento com chave de tentativa (`attemptKey`) única; repetir a mesma chave não cria outro evento. Os resultados de um fundamento são **mutuamente exclusivos** (um único valor por tentativa).
5. **Só registros válidos entram nas contas.** "Desfazer" anula o evento (`voidedAt`), sem apagá-lo; todas as estatísticas ignoram eventos anulados.
6. **Amostra pequena é sinalizada** (seção "Amostra").
7. Arredondamento só na exibição; cálculo interno em precisão cheia (exceção: Overall, inteiro por definição).

## A. Definidas e implementadas

### Critérios dos resultados (treinos)

São as **regras iniciais do Alpha7** (decisão de modelagem, não padrão oficial universal). A tela de registro mostra o critério de cada botão. Código: `src/domain/fundamentals.ts`.

| Fundamento | Resultado | Critério |
|---|---|---|
| Saque | Ace | Saque que termina em ponto direto, sem que o adversário consiga jogar a bola |
| | Válido | Saque dentro da quadra que não termina em ace: a bola entra em jogo |
| | Erro | Erro de saque: bola na rede, fora da quadra ou falta |
| Recepção | **A** | Permite manter praticamente todas as opções ofensivas treinadas |
| | **B** | Recepção controlada que permite construir o ataque, com algumas opções limitadas |
| | **C** | Recepção quebrada que restringe o ataque e tende a exigir uma solução de emergência |
| | **Erro** | Recepção que concede o ponto diretamente ao adversário |
| Levantamento | Excelente | Oferece ao atacante as opções ofensivas planejadas |
| | Atacável | Permite construir um ataque controlado, embora com limitações |
| | Quebrado | Obriga o atacante a resolver uma bola desfavorável |
| | Erro | Segundo toque que resulta em erro direto |
| Ataque | Ponto | Ataque que termina em ponto |
| | Erro | Erro direto: bola fora, na rede ou falta |
| | Bloqueado | Ataque bloqueado que dá ponto ao adversário |
| | Outra tentativa | Não terminou em ponto, erro direto nem bloqueio para ponto: a bola continuou em jogo |
| Bloqueio | Ponto | Bloqueio que termina em ponto direto |
| | Sem ponto | Tentativa de bloqueio sem ponto nem erro |
| | Erro | Erro de bloqueio: rede, invasão, toque duplo ou bola que concede o ponto |
| Defesa | Positiva | Defesa controlada que permite organizar o contra-ataque |
| | Recuperada | Bola mantida em jogo, mas sem condições de contra-atacar com as opções planejadas |
| | Erro | Bola que cai no chão ou erro no toque que concede o ponto |

### Fórmulas por fundamento (`src/domain/trainingStats.ts`)

| Fundamento | Indicador | Fórmula | Denominador |
|---|---|---|---|
| Saque | Taxa de ace | aces ÷ tentativas de saque | todas as tentativas de saque |
| | Taxa de erro | erros de saque ÷ tentativas de saque | idem |
| Recepção | Distribuição | A, B, C, erro, cada um ÷ recepções | recepções |
| | Recepção positiva | (A + B) ÷ recepções | recepções |
| | Recepção perfeita | A ÷ recepções | recepções |
| | **Nota interna de qualidade** | `(3×A + 2×B + 1×C + 0×erro) ÷ recepções`, de 0 a 3 | recepções |
| Levantamento | Distribuição | excelente, atacável, quebrado, erro, cada um ÷ levantamentos | levantamentos |
| | Excelentes ou atacáveis | (excelente + atacável) ÷ levantamentos | levantamentos |
| Ataque | **Eficiência de ataque** | `(pontos − erros − bloqueados para ponto) ÷ tentativas × 100`, de −100% a 100% | todas as tentativas de ataque (inclui "outra") |
| | Taxa de ponto / erro / bloqueado | cada categoria ÷ tentativas | tentativas |
| Bloqueio | Taxa de ponto de bloqueio | pontos ÷ tentativas de bloqueio | tentativas |
| | Taxa de erro | erros ÷ tentativas | tentativas |
| Defesa | Defesas positivas | positivas ÷ tentativas | tentativas |
| | Bolas recuperadas | recuperadas ÷ tentativas | tentativas |
| | Taxa de erro | erros ÷ tentativas | tentativas |

Notas de interpretação:

- A **nota interna de recepção** (0 a 3) é uma escolha do Alpha7 para resumir a distribuição em um número. Não é um padrão oficial universal e **não deve ser apresentada como tal**. Os pesos 3/2/1/0 estão em `RECEPTION_SCORE_WEIGHTS`. Nota 0 com tentativas (só erros) é diferente de indisponível (sem tentativas).
- **Levantamento ≠ resultado do ataque.** A qualidade da levantada mede a bola entregue ao atacante; o desfecho do ataque é outro indicador. O levantador **não** é avaliado só pelo resultado do ataque, e registrar ataques nunca altera as estatísticas de levantamento (há teste para isso).
- A **eficiência de ataque** pode ser negativa e é exibida com sinal ("−66,7%"). "Outra tentativa" entra no denominador mas não soma nem desconta.
- Fundamento sem tentativas: o indicador é "—" e o contexto "sem tentativas registradas".

### Indicador principal por fundamento (comparações, perfil, resumos)

| Fundamento | Indicador principal |
|---|---|
| Saque | Taxa de ace |
| Recepção | Nota interna (0 a 3) |
| Levantamento | Excelentes ou atacáveis |
| Ataque | Eficiência de ataque |
| Bloqueio | Taxa de ponto de bloqueio |
| Defesa | Defesas positivas |

Maior é melhor em todos. São só um ponto de partida para comparar; o resumo mostra também os demais indicadores.

### Amostra

`MIN_SAMPLE = 10` tentativas (provisório). Por atleta e por fundamento:

- **0 tentativas:** indicador indisponível.
- **1 a 9:** "amostra insuficiente": o valor é mostrado só como descrição, sem ranking e sem conclusões.
- **10 ou mais:** amostra adequada.

Nos cartões de fundamento do resumo, o mesmo limite se aplica ao total de tentativas do treino. **Comparação entre participantes:** só se ordena e numera quem tem amostra adequada, e **apenas se houver ao menos 2 atletas** nessa condição naquele fundamento; caso contrário a tabela é descritiva (ordem alfabética, sem ranking) e avisa "Sem base para comparar". Nenhuma conclusão automática é escrita: o resumo mostra números e fórmulas, não frases do tipo "melhor jogador".

### Resumo do treino

Participantes, exercícios, registros válidos, registros desfeitos (contagem à parte, fora das contas), fundamentos com registro, registros por exercício e por participante (contagens de registros, não percentuais). Treino cuja lista de participantes tem atleta sem registros mostra o atleta com 0 registros como contagem real.

### Perfil do atleta: métricas observadas

Indicador principal de cada fundamento calculado de **todos os treinos** do atleta (eventos válidos), com denominador e aviso de amostra pequena; "Treinos com participação" = treinos concluídos em que o atleta está na lista de participantes ÷ treinos concluídos. É separado das notas técnicas e do Overall.

### Dashboard

"Treinos concluídos" = contagem de treinos com status concluído (real). "Overall médio do elenco" e demais indicadores de avaliação continuam como antes. "Partidas disputadas" segue como **demonstração**.

### Overall (`src/domain/overall.ts`)

```
overall = arredonda( Σ(nota_i × peso_i) ÷ Σ(peso_i) ),  limitado a 1..99
```

- `nota_i`: os 9 atributos da avaliação mais recente do atleta (SAC, REC, LEV, ATA, BLQ, DEF, VEL, IMP, LEI).
- `peso_i`: peso do atributo para a **posição principal** do atleta. Só a proporção importa.
- Pesos de 0 a 100; soma maior que zero; peso 0 anula o atributo. Arredondamento ao inteiro mais próximo (metade sobe). Sem avaliação → `null`.
- É **derivado**: nunca armazenado. Mudar os pesos recalcula todos os Overalls. Explicável: `explainOverall` devolve nota, peso relativo e pontos por atributo.

**Pesos provisórios (escolha de modelagem do Alpha7, não classificação científica):**

| | SAC | REC | LEV | ATA | BLQ | DEF | VEL | IMP | LEI |
|---|---|---|---|---|---|---|---|---|---|
| Levantador | 8 | 4 | 34 | 4 | 8 | 10 | 8 | 4 | 20 |
| Oposto | 12 | 2 | 0 | 34 | 14 | 8 | 8 | 14 | 8 |
| Ponteiro | 12 | 22 | 0 | 22 | 6 | 16 | 8 | 8 | 6 |
| Central | 8 | 0 | 0 | 22 | 36 | 4 | 8 | 14 | 8 |
| Líbero | 0 | 32 | 8 | 0 | 0 | 34 | 12 | 0 | 14 |

(Cada linha soma 100.) Editáveis em Configurações.

### Outras (avaliações)

- **Overall médio do elenco:** média dos Overalls atuais dos atletas **com avaliação**, com "n de N avaliados".
- **Evolução do Overall da equipe:** por mês, média usando a última avaliação de cada atleta até o fim do mês; cada ponto informa o tamanho da amostra.
- **Evolução e variação do Overall do atleta:** Overall de cada avaliação recalculado com os pesos atuais; variação = atual − anterior (`null`, não 0, com uma só avaliação).
- **Destaques:** "Maiores Overalls" e "Maior evolução" (só variações positivas): baseados em notas, **não** em estatísticas de jogo.
- **Etiqueta da carta e análise técnica:** rótulo do maior atributo; 3 maiores e 2 menores atributos, sem repetir.

### Razão e formatação (`src/domain/metrics.ts`)

`ratio(acertos, tentativas)`: inteiros ≥ 0, acertos ≤ tentativas; valor `null` se tentativas = 0. `formatPercent` mostra "—" quando `null`; `formatRatioContext` mostra "x de y" ou "sem tentativas registradas".

## B. Definidas e não implementadas

Dependem de partidas (rallies). Seguem os princípios 2 a 5.

| Métrica | Fórmula | Contexto exibido |
|---|---|---|
| Sucesso no side-out | rallies ganhos recebendo o saque ÷ rallies em que A7 recebeu | "95 de 152" |
| Pontos por jogo | pontos de ataque, bloqueio e ace ÷ partidas em que o atleta jogou | partidas |
| Aproveitamento de vitórias | vitórias ÷ partidas disputadas | "11 de 14" (hoje só demonstração) |
| Indicadores de fundamentos **em jogo** | mesmas fórmulas dos treinos, sobre eventos de partida | tentativas |

Eventos de partida terão coleção própria; **não** se misturam com os de treino. Estatística consolidada de equipe por período (referência 07) depende de definir recortes.

## C. Decisões iniciais que precisam de validação

Estas regras foram **adotadas** para a primeira versão do módulo de treinos (para permitir o registro) e valem até serem revistas. Cada uma pode mudar fórmulas e resultados exibidos.

1. **Critérios de recepção A/B/C/erro:** adotados como na tabela acima. *Validar:* se "bola de graça" (devolvida direto ao adversário sem ponto) é C ou erro; se há distinção por zona de chegada ou por tipo de saque (float, viagem).
2. **Nota interna de recepção (3/2/1/0):** pesos adotados por convenção comum de "passer rating". *Validar* se faz sentido para o nível da equipe e se o erro deve valer 0 ou negativo.
3. **Critérios de levantamento:** adotados como na tabela. *Validar:* diferença entre excelente e atacável para cada tipo de bola e se a qualidade deve considerar a posição de origem do passe.
4. **Eficiência de ataque:** adotada a fórmula do brief, `(pontos − erros − bloqueados) ÷ tentativas`. *Validar:* se "ataque bloqueado e defendido" (bola continua) é "outra tentativa" (como hoje) ou deve descontar; se a bola de graça conta como tentativa.
5. **Bloqueio:** "sem ponto" agrupa toque que amortece e tentativa neutra. *Validar* se vale registrar bloqueio-defesa (toque que permite o contra-ataque) como categoria à parte.
6. **Defesa:** "positiva" (permite contra-ataque) × "recuperada" (bola salva sem contra-ataque). *Validar* a fronteira entre as duas.
7. **Limite de amostra (10 tentativas):** provisório. *Validar* um valor por fundamento (saque e ataque costumam ter mais tentativas por sessão que bloqueio).
8. **Indicador principal por fundamento** (tabela acima) para comparar atletas.
9. **Treino "concluído":** hoje é uma ação manual do responsável. *Validar* se deve existir fechamento automático e se treinos concluídos devem ficar bloqueados para edição de registros.
10. **Participação:** "esteve na lista de participantes" é usado como presença; não há chamada separada.
11. **Pesos do Overall** (tabela acima): revisão por posição e se atributos físicos devem pesar na nota de atleta amador.
12. **Partidas:** formato da competição (sets, pontos, set decisivo, substituições), motivos do ponto e quando "não informado" é aceitável.
13. **Evolução por janela temporal** (30 dias, temporada): definir recortes antes de criar o seletor de período.
