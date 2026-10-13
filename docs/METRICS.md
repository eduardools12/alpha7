# Métricas e fórmulas

Três categorias: **A. Definidas e implementadas**, **B. Definidas e ainda não implementadas** (dependem de treinos e partidas) e **C. Precisam de validação** com a comissão técnica antes de entrar em código.

## Princípios

1. **Nota técnica ≠ estatística.** Atributos são avaliações do treinador (1 a 99). Estatísticas são contagens de eventos observados. Uma nunca altera a outra automaticamente.
2. **Ausência de dado não é zero.** Sem avaliação → Overall indisponível (`null`, exibido "—"). Sem tentativas → métrica indisponível, nunca 0%. 0% só existe com tentativas registradas e nenhum acerto (ex.: "0 de 12").
3. **Percentual sempre com contexto:** "54,0% (162 de 300)".
4. **Uma tentativa conta uma vez** (chave de idempotência por toque) e só registros **válidos** (não anulados) entram nos cálculos.
5. Arredondamento só na exibição; cálculo interno em precisão cheia (exceção: Overall, que é um inteiro por definição).

## A. Definidas e implementadas

### Overall (`src/domain/overall.ts`)

```
overall = arredonda( Σ(nota_i × peso_i) ÷ Σ(peso_i) ),  limitado a 1..99
```

- `nota_i`: os 9 atributos da avaliação mais recente do atleta (SAC, REC, LEV, ATA, BLQ, DEF, VEL, IMP, LEI).
- `peso_i`: peso do atributo para a **posição principal** do atleta. Só a proporção importa: dobrar todos os pesos não muda o Overall.
- Pesos de 0 a 100; soma maior que zero; peso 0 anula o atributo.
- Arredondamento: ao inteiro mais próximo (metade sobe).
- Sem avaliação → `null`.
- É **derivado**: nunca armazenado. Mudar os pesos recalcula todos os Overalls, inclusive o histórico exibido.
- Explicável: `explainOverall` devolve, por atributo, nota, peso relativo (%) e pontos; a soma dos pontos é a nota bruta. A tela de perfil mostra essa tabela.

**Pesos provisórios (escolha de modelagem do Alpha7, não classificação científica):**

| | SAC | REC | LEV | ATA | BLQ | DEF | VEL | IMP | LEI |
|---|---|---|---|---|---|---|---|---|---|
| Levantador | 8 | 4 | 34 | 4 | 8 | 10 | 8 | 4 | 20 |
| Oposto | 12 | 2 | 0 | 34 | 14 | 8 | 8 | 14 | 8 |
| Ponteiro | 12 | 22 | 0 | 22 | 6 | 16 | 8 | 8 | 6 |
| Central | 8 | 0 | 0 | 22 | 36 | 4 | 8 | 14 | 8 |
| Líbero | 0 | 32 | 8 | 0 | 0 | 34 | 12 | 0 | 14 |

(Cada linha soma 100.) Editáveis em Configurações. **Precisam ser revistos pela comissão técnica.**

### Overall médio do elenco (dashboard)

Média aritmética dos Overalls atuais dos atletas **com avaliação**; mostra "n de N atletas avaliados". Sem nenhum avaliado → "—".

### Evolução do Overall da equipe

Para cada mês entre a primeira e a última avaliação: média dos Overalls usando, para cada atleta, a **última avaliação até o fim daquele mês**; atletas sem avaliação até então não entram. Cada ponto informa quantos atletas o compõem. Arredondado a 1 casa.

### Evolução do Overall do atleta e variação

Overall de cada avaliação, recalculado com os pesos atuais, em ordem cronológica. Variação = Overall atual − Overall da avaliação anterior; com uma só avaliação não há variação (`null`, não 0).

### Destaques do dashboard

"Maiores Overalls": ordem decrescente (empate: ordem alfabética do nome curto). "Maior evolução": só variações positivas, ordem decrescente. São baseados em notas, **não** em estatísticas de jogo.

### Etiqueta da carta e análise técnica

Etiqueta = rótulo do maior atributo (empate: ordem canônica SAC, REC, LEV, ATA, BLQ, DEF, VEL, IMP, LEI). Pontos fortes = 3 maiores; a desenvolver = 2 menores, sem repetir. Leitura direta das notas.

### Razão e formatação (`src/domain/metrics.ts`)

`ratio(acertos, tentativas)`: inteiros ≥ 0, acertos ≤ tentativas; valor `null` se tentativas = 0. `formatPercent` mostra "—" quando `null`; `formatRatioContext` mostra "x de y" ou "sem tentativas registradas". Usada hoje no aproveitamento de vitórias e na presença do dashboard (dados de demonstração).

### Aproveitamento de vitórias (dashboard, demonstração)

`vitórias ÷ partidas disputadas` (ex.: 11 de 14 = 78,6%). Os números são demonstração até existir o módulo de partidas.

## B. Definidas e não implementadas

Dependem de registros de treinos e partidas. Todas seguem os princípios 2, 3 e 4. Definições de fundamentos (quem conta como tentativa) ainda precisam da validação da seção C.

| Métrica | Fórmula | Contexto exibido |
|---|---|---|
| Taxa de ace | aces ÷ saques | "18 de 141" |
| Taxa de erro de saque | erros de saque ÷ saques | idem |
| Eficiência de ataque (aproveitamento) | pontos de ataque ÷ tentativas de ataque | "162 de 300" |
| Eficiência de bloqueio | bloqueios que pontuam ÷ tentativas de bloqueio | "38 de 84" |
| Sucesso no side-out | rallies ganhos recebendo o saque ÷ rallies em que A7 recebeu | "95 de 152" |
| Qualidade da recepção | distribuição A/B/C/erro; positiva = (A+B) ÷ total; perfeita = A ÷ total | n por faixa |
| Pontos por jogo | pontos de ataque, bloqueio e ace ÷ partidas em que o atleta jogou | partidas |
| Presença nos treinos | presenças ÷ treinos convocados | "x de y" |

## C. Precisam de validação (propostas, não adotadas)

1. **Critérios de recepção** (referência 06 sugere): A = passe perfeito, levantador pode usar todas as opções de ataque; B = jogável, opções limitadas; C = passe difícil/quebrado, apenas uma opção ou bola de graça; **Erro direto** = recepção que dá ponto ao adversário (ace sofrido, bola fora, dois toques). *Validar:* se "bola de graça" é C ou Erro; se há distinção por zona de chegada.
2. **Eficiência de ataque:** definir entre (a) aproveitamento = pontos ÷ tentativas (como na referência 07) e (b) eficiência = (pontos − erros − bloqueados) ÷ tentativas. *Validar:* qual a comissão quer; mostrar nomes diferentes se ambas existirem.
3. **O que é tentativa de ataque** (bola recuperada e defendida pelo adversário conta? bola de graça?).
4. **Bloqueio:** conta toque que amortece sem ponto? "Eficiência de bloqueio" = pontos ÷ tentativas, ou inclui bloqueios positivos?
5. **Side-out:** conta rally ganho após recepção ruim? Considera apenas o primeiro ataque (kill)?
6. **Formato da competição:** melhor de 3 ou de 5 sets; pontos por set (25), set decisivo (15), diferença mínima de 2; limite de substituições; tempos. A pontuação só será implementada com o formato confirmado.
7. **Pesos do Overall** (tabela da seção A): revisão por posição e se atributos físicos devem pesar na nota de atleta amador.
8. **Motivos do ponto** além de ace, ataque, bloqueio, erro de saque, erro de ataque, erro do adversário: lista final e quando "não informado" é aceitável.
9. **Evolução por janela temporal** (30 dias, temporada): definir recortes antes de criar o seletor de período.
