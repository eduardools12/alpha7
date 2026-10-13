# Sistema de design

Fonte da verdade em código: [`src/styles/tokens.css`](../src/styles/tokens.css). Este documento explica as decisões. As oito referências em `design/references/` (veja `SCREEN_MAP.md`) são a especificação visual; o que mudou em relação a elas está na seção 10.

**Direção:** esportiva premium, escura. Roxo da equipe como identidade, grafite como estrutura, lilás como acento. A personalidade vem de dois lugares: a **carta de atleta** (silhueta com canto cortado, escudo de Overall, diagonais lilás) e a **tipografia condensada** dos números. O resto é contido de propósito.

## 1. Cores

| Token | Valor | Uso |
|---|---|---|
| `--a7-purple-900` | `#270949` | Roxo profundo oficial: menu lateral, escudo de Overall, texto sobre lilás claro |
| `--a7-graphite` / `--bg` | `#17141D` | Grafite oficial: fundo da aplicação |
| `--a7-lilac-500` | `#8F7AA6` | Lilás secundário oficial. **Decorativo** (bordas, linhas de quadra): sobre o fundo não atinge 4,5:1 como texto pequeno |
| `--a7-lilac-300` / `-100` | `#B9A6D0` / `#E4DCF0` | Lilás legível: rótulos, ícones ativos, chips ativos |
| `--a7-mist` / `--text` | `#F1EFF4` | Cinza-claro oficial: texto principal |
| `--a7-violet-500` / `--accent` | `#7A55C4` | Ação primária (botão). Texto branco: contraste 5,3:1 |
| `--surface-1` a `-3` | `#211D29`, `#2B2734`, `#37323F` | Cartões, elevação, divisórias fortes |
| `--surface-purple(-2)` | `#2A0E50`, `#3A1670` | Indicadores e blocos de destaque da marca |
| `--text-muted` / `--text-faint` | `#B6AEC3` / `#9187A2` | Texto secundário (≥ 4,5:1) e terciário |

Branco `#FFFFFF` é cor central da equipe: camisa branca, texto sobre roxo.

**Estado (somente indicador, nunca decoração):** `--ok #46C783`, `--warn #F3B94D`, `--danger #F57B7B`, `--info #8A94EE`, cada um com fundo translúcido (`-bg`). Verde = ativo/melhora; amarelo = transição/ponto a desenvolver; vermelho = lesionado/erro.

O brief fixou os códigos oficiais como "referências iniciais". Conferidos contra `a7 logo.jpeg`: a cor dominante escura do arquivo mede ≈ `#280848` (agrupada em passos de 4 níveis), equivalente a `#270949` dentro da compressão JPEG. Foram mantidos. Nas fotos dos uniformes o roxo aparece mais escuro por causa do sombreamento (≈ `#1C082C`), então o roxo da camisa na carta (`#2F1058`) é uma aproximação ilustrativa.

## 2. Tipografia

| Papel | Família | Onde |
|---|---|---|
| Interface | **Inter Variable** (local, Fontsource) | Títulos, texto, formulários, tabelas |
| Números e nomes | **Barlow Condensed** 600/700 (local) | Overall, atributos, nome nas cartas, indicadores grandes, ordem de saque |

Escala: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 px (`--fs-xs` a `--fs-4xl`). Títulos de página 700 a 800 com espaçamento levemente negativo. Texto corrido até ~65 caracteres por linha (`text-wrap: pretty`). Números de coluna usam `font-variant-numeric: tabular-nums` (classe `.tabular`).

Nomes em caixa alta existem só na carta (convenção de carta esportiva, presente na referência). Em todo o resto, frase com inicial maiúscula.

## 3. Espaçamento, raios e movimento

- Base de 4px: `--s-1` (4) a `--s-12` (48).
- Raios: 8px controles, 12px cartões, 18px painéis de herói, pílula para chips e etiquetas.
- Sem sombras decorativas nos cartões (hierarquia por superfície). Sombra só em menus flutuantes.
- Movimento: apenas resposta a ação do usuário (hover da carta, pressionar botão, spinner). `prefers-reduced-motion` zera durações.

## 4. Componentes

**Botão** (`Button`, `ButtonLink`): `primary` (violeta, uma por região), `secondary` (contorno lilás), `ghost`, `danger` (contorno vermelho). Altura mínima 44px (`sm` 36px). Ícone opcional à esquerda. Desativado = 50% de opacidade e `disabled`.

**Chip** (`Chip`): botão de alternância com `aria-pressed`; ativo preenche em lilás claro. Usado nos filtros.

**Campo** (`TextField`, `SelectField`, `TextAreaField`): rótulo sempre visível, dica opcional, erro com `role="alert"` e `aria-invalid`. Fundo mais escuro que o cartão. Erro = borda vermelha + texto, nunca só cor.

**Cartão** (`Card`): superfície com título opcional; variante `purple` para indicadores.

**Aviso** (`Notice`): `info`, `success`, `warning`, `error`, com ícone, barra lateral colorida e `role` adequado (`alert` para erro e atenção).

**Estados** (`EmptyState`, `LoadingBlock`): vazio explica o que falta e oferece a ação; carregando usa `role="status"`.

**Etiquetas:** `StatusBadge` (Ativo, Lesionado, Transição) e `DemoTag` (tracejada, lilás) para qualquer registro de demonstração.

**Carta de atleta** (`PlayerCard`): link inteiro para o perfil. Anatomia: moldura de 2px em degradê roxo/lilás; canto inferior direito cortado (`clip-path`); cabeçalho com diagonais (roxo, lilás, grafite) e camisa em SVG nas cores do uniforme; escudo de Overall no canto superior esquerdo (traço "—" sem avaliação); etiqueta no canto superior direito com o rótulo do **maior atributo** (derivado, nunca opinião); nome e número em Barlow Condensed; posição principal e secundária; grade 3×2 com SAC REC LEV ATA BLQ DEF; selo de situação quando não ativo.

**Escudo de Overall** (`OverallShield`): `sm` (carta) e `lg` (perfil). `role="img"` com nome "Overall 85" ou "Overall indisponível: sem avaliação".

**Barra de atributo** (`AttributeBar`): `role="meter"` de 1 a 99, rótulo por extenso + sigla.

**Camisa** (`Jersey`): SVG ilustrativo nas duas cores oficiais com o A7 original. Não substitui as imagens oficiais dos uniformes (exibidas em Configurações).

**Quadra** (`CourtView`): metade da quadra, rede no topo, linha de ataque, seis zonas (linha da rede P4 P3 P2; fundo P5 P6 P1) e vaga de líbero abaixo. Cada zona é um botão com nome acessível ("Zona P3: Pedro A., camisa 10, Central"). Estilizada, sem perspectiva 3D, para manter alvos de toque grandes.

**Gráfico de tendência** (`TrendChart`): área em lilás, pontos, grade horizontal discreta, dica ao passar. Acompanha **tabela oculta** com os mesmos números (leitores de tela). Carregado sob demanda.

**Botões de resultado** (registro de treino): grandes (≥ 56 px), coloridos pelo **tom** do resultado: `--outcome-good` verde, `--outcome-ok` azul-violeta, `--outcome-warn` laranja (texto escuro), `--outcome-bad` vermelho, `--outcome-neutral` grafite com contorno. Texto branco sobre verde, azul-violeta e vermelho (≥ 4,5:1). O rótulo usa Barlow Condensed e o subtítulo curto fica abaixo; o nome acessível é "rótulo, subtítulo". Ao tocar, o botão recebe um pulso de confirmação (respeita `prefers-reduced-motion`) e fica bloqueado por 350 ms.

**Seletores horizontais** (exercício, jogador, fundamento): botões em linha com rolagem por gesto no celular (sem barra de rolagem visível) e quebra em linhas a partir de 768 px. Estado ativo = `aria-pressed` com preenchimento lilás (ou contorno e halo no caso do jogador).

**Painel de resultado fixo** (celular): depois de escolher o jogador, o painel com os botões fica fixo acima da barra inferior, baixo o bastante para não cobrir as listas. Antes de escolher, segue o fluxo normal. No desktop nunca é fixo.

**Faixa de feedback** (`toast`): sobreposta (não ocupa espaço, então nada "pula" sob o dedo), anunciada por `role="status"`, some sozinha em 3,5 s; borda verde (registrado), laranja (desfeito) ou vermelha (erro).

**Barras de distribuição** (`DistributionBars`): rótulo, barra no tom do resultado e, sempre em texto, contagem e percentual. Sem tentativas, barras vazias e percentual "—". A barra é apoio visual e é ocultada de leitores de tela.

**Região de tabela rolável:** tabelas largas ficam num contêiner focável (`tabIndex=0`, `role="region"`, com nome) para que quem usa teclado consiga rolar.

**Tabelas:** cabeçalhos `th scope`, números alinhados à direita e tabulares, rolagem horizontal contida em telas pequenas. Sem zebra; linhas separadas por filete.

## 5. Gráficos

Regras: uma cor de ênfase (lilás) por série; grade só horizontal; eixos sem linha; valores sempre acessíveis em tabela; título diz o que mostra e a legenda dá o contexto ("Overall médio dos atletas avaliados, mês a mês"). Cores de recepção (A verde, B azul-violeta, C amarelo, erro vermelho) seguem a referência 07 e ficam reservadas ao módulo de estatísticas.

## 6. Estados de interação

Hover: fundo translúcido lilás (botões e links de menu), carta sobe 3px. Pressionado: botão desce 1px. Foco visível: contorno de 2px `--focus` (#D3C4F5) com 2px de recuo, em todos os controles. Selecionado: `aria-pressed`/`aria-current` + realce (chip preenchido, item de menu com fundo, zona da quadra com contorno branco e halo). Desativado: opacidade 50%.

## 7. Responsividade

Ponto de virada em **60rem (960px)**.

- **≥ 960px:** menu lateral fixo (15,5rem), conteúdo até 80rem, grades de 3 e 4 colunas.
- **< 960px:** barra superior com o símbolo e barra **inferior** com Dashboard, Elenco, Escalações, Treinos e "Mais" (Partidas, Estatísticas, Configurações). O conteúdo reserva espaço para a barra.
- Cartas em grade fluida (mín. 11,75rem), indicadores em 2 colunas, painéis empilhados, formulários em 1 coluna até 40rem.
- Alvos de toque ≥ 44px. Sem rolagem horizontal de 360px a 1920px (verificado em Chrome real).

## 8. Acessibilidade

Pular para o conteúdo; foco movido ao conteúdo ao trocar de tela; título da aba por tela; rótulos reais; erros anunciados e foco no primeiro; contraste de texto ≥ 4,5:1 (lilás `#8F7AA6` só decorativo); informação nunca só por cor (situação tem texto; erro tem mensagem); `prefers-reduced-motion`; gráficos com tabela alternativa.

## 9. Marca

Logo A7 oficial: `design/assets/a7 logo.jpeg` (roxo sobre branco). Cópias idênticas em `public/brand/original/`. Para fundos escuros foram **derivados** PNGs transparentes (`a7-mark-white|lilac|purple.png`) usando a luminosidade do original como transparência: o desenho não é refeito nem distorcido (proporção mantida, `height` fixo e `width: auto`). Uniformes: `a7 branco.jpeg` e `a7 roxo.jpeg`, exibidos em Configurações. Recomendação (não vem do material oficial): deixar ao menos metade da altura do símbolo de espaço livre ao redor.

## 10. Diferenças deliberadas em relação às referências

| Referência | O que a aplicação faz diferente | Motivo |
|---|---|---|
| Fotos de atletas (01 a 06, 08) | Camisa em SVG nas cores do uniforme | As fotos dos mockups são imagens geradas, sem licença para uso e sem relação com atletas reais |
| 01: seletor "Últimos 30 dias" e "Novo Registro" | Omitidos | Não há dados de período nem registro rápido ainda: seriam controles decorativos |
| 01 e 03: usuário "Coach Silva" e sair | Omitidos | Não há autenticação |
| 01: "Atletas 18, Treinos 42, Partidas 14, Aproveitamento 78,5%" | Atletas e Overall médio reais; treinos e partidas com etiqueta Demo; aproveitamento 78,6% = 11 de 14 | 11/14 = 78,57%; todo percentual mostra "x de y" |
| 01: "Destaques individuais" por pontos | Destaques por Overall e por evolução de Overall | Pontos exigem estatísticas de jogo (módulo futuro) |
| 03: Overall 88 e "Última avaliação 86 (+2)" | Overall sempre calculado da última avaliação; variação vs. avaliação anterior | O mockup é incoerente (88 vs 86) |
| 03: "Histórico de Alterações" duas vezes | Uma vez, como "Histórico de avaliações" | Duplicado no mockup |
| 03: pontos fortes e a desenvolver como texto livre | Derivados dos maiores e menores atributos | Sem inventar opinião |
| 02: mesmas notas repetidas em várias cartas; "Opósto"; "Fom nome" | Notas reais por atleta; textos corrigidos | Erros dos mockups |
| 01: "Contasin regressiva" | Omitido | Erro de texto |
| 04: "Gerar arte" | Botão desativado "em breve" | Gerador ainda não existe |
| 04: quadra azul em perspectiva, ordem 1º a 6º fora da quadra | Quadra lilás estilizada; ordem de saque em lista e zona P1 a P6 na própria zona | Alvos de toque e clareza da ordem |
| 04: "Posições 1/4/5/6" e jogador repetido (Lucas #4 duas vezes) | Zonas P1 a P6, cada atleta uma vez | Erros do mockup |
| 07: "Qualidade de Recepção (Perfect, Medium, Difficult, Erro)" em inglês e eixo "16/wek" | Distribuição da recepção em português (A, B, C, Erro) dentro do resumo de cada treino; a tela 07 consolidada segue planejada | Textos do mockup com erros; a consolidação entre treinos depende de recortes de período |
| 06: botões A/B/C/Erro com "Registrar ação" e contador "+1 / −1"; "Sessão 65% concluída"; duas ações "Desfazer" | Um toque no resultado já registra; um único "Desfazer último registro"; sem barra de progresso | Não há meta de tentativas para medir progresso; o desfazer cobre o erro de toque |
| 06: cores dos botões (verde, azul claro, laranja, vermelho) | Mesmos tons, escurecidos o bastante para texto com contraste ≥ 4,5:1 (laranja usa texto escuro) | Acessibilidade |
