# Gerador de artes (0.8.0)

Artes da equipe em PNG, geradas no navegador, no sistema visual da identidade do Alpha 7. Só a comissão técnica usa (`arts:generate`). Rota `/artes`.

**Origem.** O sistema visual (faixas a 26°, tipografia condensada, assinatura de três blocos) foi desenhado no projeto "Alpha 7 — Identidade Visual", com scripts em Python e Chrome. A 0.8.0 **porta esse sistema para TypeScript dentro do app**: o gerador não depende de Python, de Chrome instalado nem de rede. Os scripts de lá continuam sendo ferramenta de design; este app não os executa.

## Tipos de arte

| Tipo | Dados (de onde vêm) | O que é digitado na tela | Formatos |
|---|---|---|---|
| Escalação | partida + escalação salva + atletas (e fotos) | nada | feed, story |
| Dia de jogo | partida (adversário, competição, data, horário, local) | rodada ou fase (opcional) | feed, story |
| Resultado | partida **concluída**; sets vencidos e parciais vêm dos pontos ativos de cada set | nada | feed, story |
| Atleta | cadastro (nome completo, camisa, posição principal, foto) | nada | feed, story |
| Carta do atleta | cadastro + avaliação vigente (Overall derivado, 6 atributos, traço do maior atributo) | nada | feed, story |
| Destaque | cadastro | fundamento ou motivo; até 3 estatísticas (nome e valor) | feed, story |
| Capa de lances | cadastro | chamada, título, temporada ou jogo | feed, story |
| Institucional | fixo: apresentação da equipe, manifesto "três toques", palavras-chave | nada | feed, story |
| Capas de destaques | fixo: Equipe, Atletas, Jogos, Resultados, Bastidores | nada | quadrado 1:1 |

Os textos fixos das peças institucionais ("ALPHA 7", "VÔLEI COMPETITIVO", os cinco atributos, "TRÊS TOQUES. UM SÓ TIME.") são **propostas a validar com a equipe**; os cinco atributos vêm do briefing da identidade (competição, disciplina, precisão, unidade, evolução). O @ do Instagram não aparece em nenhuma arte (ainda não foi definido).

Todas (menos as capas dos destaques) têm **fundo roxo ou branco**. O story 9:16 recebe a composição 4:5 no miolo da tela (zona segura da grade do perfil); o plano diagonal do fundo continua por toda a altura.

## Regras que não podem ser violadas

1. **Nada é inventado.** O que não está cadastrado não aparece, ou aparece como "a definir". Sem competição, o rótulo some; sem local, "A DEFINIR"; sem avaliação, a carta mostra "—" e nunca 0.
2. **Estatística, destaque e fase são texto digitado** pela comissão: nunca calculados nem completados sozinhos. Uma estatística só com nome ou só com valor é recusada com explicação.
3. **O resultado nunca é digitado.** Sets vencidos e parciais saem de `matchState` (pontos ativos); pontos anulados não contam; set sem pontos não aparece. Partida não concluída não gera resultado.
4. **Foto é a referência do cadastro** (`Player.photo`), a mesma do perfil e da carta; nunca uma cópia. Sem foto, a arte mostra uma área marcada ("SEM FOTO CADASTRADA") ou o número da camisa; nunca finge ser uma pessoa. Foto que não carrega gera aviso, não erro.
5. **A prévia e o PNG usam o mesmo SVG.** Determinístico: o mesmo modelo e a mesma medição geram o mesmo texto. Sem IA, sem imagem externa (só data URI), sem `foreignObject` nem script.
6. **Texto sempre cabe.** `fitText`/`fitLines` reduzem o corpo e, no limite, cortam com reticências; o construtor mede cada texto com a fonte real e `warnings()` acusa texto cortado, fora da margem de 72 px ou sobreposto (a tela mostra o aviso).

## Sistema visual

- **Paleta (informada pela equipe):** Roxo Alpha `#270949`, Branco `#FFFFFF`, Cinza-lilás `#F0EDF4`, Roxo profundo `#160623`. **Tons de apoio derivados do roxo** (não oficiais): Roxo 2 `#3D225B`, Roxo 3 `#573F71`, Lilás `#A99DB6`, Lilás 2 `#D4CEDB`, Roxo 40% `#7D6B92`. Sem preto, sem dourado, sem sombra, sem brilho. A única exceção são os gradientes da **carta do atleta** (escudo de Overall e sombra da foto), que são os da carta do app.
- **Geometria:** todas as diagonais seguem 26° (medido nas diagonais do monograma A7). Faixa (paralelogramo), linha interna (fio dentro da faixa), plano tonal ao fundo e a **assinatura de três blocos** no rodapé (recepção, levantamento, ataque).
- **Tipografia:** Big Shoulders Bold (títulos, números, nomes, sempre em caixa alta) e Instrument Sans (rótulos; mínimo de 22 px na arte de 1080 px de largura).
- **Composição:** 1080 x 1350, margem de 72 px, cabeçalho (logo à esquerda, rótulos à direita), rodapé fixo (linha a 1236 px).
- **Foto:** entra numa máscara inclinada. Em **duotone roxo** (filtro SVG: Roxo profundo, Lilás e Branco) nas artes da marca, para unificar fotos de ginásios e luzes diferentes; **natural** na carta do atleta, como aparece no elenco. Enquadramento por aproximação e posição (sem distorcer).
- **Carta do atleta:** a mesma do elenco (canto inferior direito cortado, escudo de Overall, faixas diagonais, camisa SVG sem foto, seis atributos), com as cores dela (`#211D29`, `#381268`, `#B9A6D0`...).
- **Logo:** `public/brand/a7-mark-art-{white,purple}.png`, derivada do arquivo original (mesmo desenho; só o fundo vira transparência) com as bordas limpas. Branca sobre roxo, roxa sobre branco. Nunca redesenhada nem distorcida (há teste da proporção).

Contraste (WCAG) dos pares usados: branco sobre roxo 17,19:1; Lilás sobre roxo 6,70:1; roxo sobre branco 17,19:1; Roxo 40% sobre branco 4,78:1. Palavras gigantes de exibição (post de identidade) usam tons de 3,46:1 a 7,75:1, aceitáveis só para texto grande.

## Arquitetura

```
src/domain/arts.ts            modelos, montadores puros (dados do app -> modelo), validações, nomes de arquivo
src/features/arts/
  ArtsPage.tsx                estado, montagem do modelo, prévia, exportação
  ArtControls.tsx             tipos, escolhas por tipo, aparência, enquadramento
  artFacts.ts                 "O que aparece na arte"
  useArtPhotos.ts             baixa as fotos cadastradas (data URL) e lê o tamanho original
  exportPng.ts                SVG -> PNG (canvas) e download
  sharePng.ts                 compartilhar (Web Share)
  artAssets.ts                logo embutida
  engine/
    palette.ts geometry.ts    cores e geometria a 26°
    fonts.ts measure.ts       fontes (woff2 em data URI) e medição de texto com a fonte real
    canvas.ts                 construtor de SVG + conferências de composição
    kit.ts                    cabeçalho, rodapé, assinatura, faixa, área de foto, ajuste de texto
    templates/                match.ts (dia de jogo, resultado, escalação), athlete.ts, institutional.ts
    render.ts                 modelo -> SVG
```

Fluxo: `buildXArt(...)` (domínio, valida e devolve modelo ou motivo) → `renderArt(modelo, { assets, measure })` → SVG → `<img>` da prévia e `svgToPng`. As fontes precisam estar carregadas antes de medir (`loadArtFonts`); sem a API de fontes (jsdom) a medição aproximada assume, de forma determinística.

### Dependências
`@fontsource/big-shoulders` e `@fontsource/instrument-sans` (woff2 de cerca de 15 a 17 kB cada, só o subconjunto latino): são as duas fontes da identidade; sem elas a arte sairia com outra fonte e as medidas de texto não valeriam. Carregadas só com a tela de artes (telas sob demanda).

## Como adicionar um tipo de arte

1. Em `domain/arts.ts`: acrescente o tipo a `ART_KINDS`, o modelo à união `ArtModel`, o rótulo, os formatos, um `buildXArt` (validando e recusando o que não dá) e o nome do arquivo.
2. Em `features/arts/engine/templates/`: desenhe com o kit (cabeçalho, faixas, `fitText`, `photoSlot`, rodapé), em 1080 x 1350, chamando `centerComposition(H)` e `endComposition()`; desenhe o plano de fundo **antes** de `centerComposition`.
3. Ligue em `render.ts`, em `ArtControls.tsx` (escolhas) e em `ArtsPage.tsx` (montagem do modelo), e em `artFacts.ts`.
4. Testes: montador (domínio), desenho (`engine.test.ts` renderiza todos os modelos e exige zero avisos) e tela.

## Verificação

- `domain/arts.test.ts`: montadores, validações, textos de data, nomes de arquivo.
- `engine/engine.test.ts`: paleta, geometria, construtor, enquadramento da foto, **todas as artes** em feed, story, fundo roxo e branco (tamanho, zero avisos de composição, sem imagem externa, só cores da paleta).
- `arts.test.tsx`, `artsShare.test.tsx`: fluxos da tela, validações, exportação, papéis.
- `e2e/arts.spec.ts`, `e2e/photos.spec.ts` (Chrome real): PNG baixado de verdade (assinatura, tamanho, fundo, fonte da arte, cor do duotone), sem rolagem horizontal e sem violações de acessibilidade.

**Não verificado:** celular de verdade (Compartilhar e o download no iPhone), Safari e Firefox (o filtro duotone é do SVG padrão, mas só foi visto em Chrome), fotos de tamanhos extremos além das reduzidas pelo cadastro (640 x 800).
