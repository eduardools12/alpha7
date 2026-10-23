# Alpha7 · Análise de vídeo (fase 1: protótipo)

Detecta pessoas em gravações de voleibol, mantém **números temporários** de trilha entre os quadros e exporta um vídeo
anotado e um JSON versionado. É um protótipo isolado: não altera o aplicativo publicado, não fala com o Supabase e não
envia nenhum vídeo para fora do computador.

**O que NÃO faz (de propósito):** não reconhece quem é cada atleta, não conta saque, recepção, levantamento nem ataque,
e não faz análise tática. Um `track_id` é só o número que o rastreador deu a uma caixa; ele pode trocar quando atletas
se cruzam, ficam atrás da rede ou saem do quadro.

## Estado da validação (leia antes de confiar nos números)

- **Testado com arquivos sintéticos:** o fluxo inteiro, com 69 testes automáticos, vídeos de retângulos e um detector de
  mentira (leitura, tempos, rastreamento, JSON, vídeo anotado, falhas).
- **Testado em gravação real (inspeção visual, 2026-10-20):** os primeiros 60 s de um amistoso do Alpha7 (848x478, 29,8 fps,
  H.264, 84 s no total), com o YOLOX-s e com o HOG. Foi uma **inspeção a olho de 4 quadros do YOLOX e 2 do HOG**, sem
  anotação manual para comparar. **Nenhuma taxa de acerto foi medida e nenhuma é afirmada.**
  - **YOLOX-s:** as pessoas em quadra foram encontradas com caixas justas e confiança de 0,6 a 0,9; 5 a 11 pessoas por
    quadro (mediana 8). Nesse trecho aparecem mais pessoas do que os seis do time (os dois lados da quadra e quem está
    fora), e o detector pega todas.
  - **Rastreamento:** com o rastreador da fase 1 (`--tracker basic`) saíram 55 trilhas em 60 s para cerca de 8 a 10
    pessoas visíveis, ou seja, muita troca de número. Com o rastreador melhorado (padrão desde 2026-10-20) saem 23 no
    mesmo trecho. Veja "Melhorias do rastreamento" abaixo, com os números e o que eles **não** provam. O número da
    trilha continua **não servindo como identidade**.
  - **HOG:** perde parte dos atletas e junta duas pessoas na mesma caixa (1 a 9 detecções, mediana 4, contra 5 a 11 do
    YOLOX). Serve só como linha de base.
- **Defeito que a gravação real revelou e foi corrigido:** o HOG falhava em todo quadro com pessoas porque o
  `NMSBoxes` do OpenCV recusa limiar negativo. Os testes sintéticos não pegaram (imagem vazia nunca gera caixas); há teste
  de regressão.
- Ainda não validado: outros ângulos de câmera, outros ginásios, jogo inteiro (só 60 s de um vídeo), iluminação diferente.

## Instalação (Windows, PowerShell; precisa de Python 3.11 ou mais novo)

```powershell
cd services\video-analysis
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Tudo fica dentro da pasta (`.venv` é ignorado pelo Git). Nada é instalado no frontend. Usamos OpenCV **4.x**: o 5.0
removeu o `HOGDescriptor` usado como linha de base.

## Executar

```powershell
.\.venv\Scripts\python.exe -m video_analysis --input C:\caminho\gravacao.mp4 --output saida --max-seconds 60
```

Gera em `saida\`: `gravacao.analysis.json` (resultado), `gravacao.summary.json` (resumo) e `gravacao.annotated.mp4`
(caixas, `T<n>` e confiança desenhados). Opções principais:

| Opção | Para que serve | Padrão |
|---|---|---|
| `--detector hog\|yolox-onnx` | modelo de detecção | `hog` |
| `--weights modelo.onnx` | pesos (obrigatório com `yolox-onnx`) | |
| `--target-fps N` ou `--stride N` | quantos quadros processar (1 a cada N) | 5 fps |
| `--max-width N` | reduz o quadro antes de detectar (0 = original); o JSON volta à resolução original | 960 |
| `--start S`, `--max-seconds S` | trecho a analisar (comece com 30 a 60 s) | vídeo todo |
| `--confidence C` | confiança mínima do detector | 0.3 |
| `--calibration quadra.json` | calibração manual da quadra (opcional) | sem |
| `--tracker improved\|basic` | rastreador (basic = o da fase 1) | improved |
| `--roi x1 y1 x2 y2 ...` | região de interesse em pixels (3 ou mais pontos) | sem |
| `--annotated-fps source\|processed` | vídeo anotado na fluidez do original (caixas interpoladas entre quadros processados) ou só nos quadros processados | source |
| `--no-video` | não gerar o vídeo anotado | gera |
| `--hash` | grava o SHA-256 do vídeo no JSON (útil para ligar à partida depois) | não |

Códigos de saída: 0 ok · 3 vídeo inexistente/ilegível · 4 detector ou calibração mal configurados · 5 análise parcial
(detector falhou 10 quadros seguidos; o que deu para processar é exportado) · 6 problema ao gravar/validar a saída.

O progresso aparece a cada 5 s. Em CPU o processamento é mais lento que o tempo real (veja "Desempenho").

## Melhorias do rastreamento (2026-10-20)

O gargalo da fase 1 era a troca de números. O rastreador agora tem duas configurações (`--tracker basic|improved`, padrão
`improved`):

1. **Nascimento exigente:** uma trilha só ganha número com 3 detecções seguidas (tolera 1 falha enquanto é provisória) e
   só nasce de caixa com altura de pelo menos 8% do quadro e proporção altura/largura entre 1 e 5.
2. **Memória e recuperação:** a trilha é guardada por até 30 quadros processados (6 s a 5 quadros/s) e, se a pessoa
   reaparece longe do ponto previsto, uma etapa extra religa a trilha perdida à detecção mais próxima, dentro de um alcance
   que cresce com o tempo sumido (0,5 altura de caixa + 0,6 por quadro perdido, no máximo 4).
3. **Aparência (cor):** histograma HSV do tronco. Entre caixas que se sobrepõem a cor só **desempata**; na recuperação ela
   **bloqueia** quem tem camisa muito diferente. Nunca decide sozinha e **não é reconhecimento de identidade**.
4. **Taxa de processamento:** 10 quadros/s em vez de 5 (opção `--target-fps 10`).

**Comparação no mesmo clipe** (`amistoso1.mp4`, primeiros 60 s, YOLOX-s, **as mesmas detecções** reaplicadas a cada
configuração por `tools/compare_tracking.py`; os parâmetros em segundos são convertidos para quadros, então 5 e 10
quadros/s são comparáveis). Para cerca de 8 a 10 pessoas visíveis:

| 5 quadros/s | trilhas | mediana | >= 10 s | < 2 s | recomeços suspeitos | saltos impossíveis |
|---|---|---|---|---|---|---|
| 0 base (fase 1) | 55 | 5,8 s | 14 | 13 | 28 | 0 |
| 1 + nascimento exigente | 51 | 5,6 s | 15 | 11 | 25 | 0 |
| 2 + memória e recuperação | 18 | 29,7 s | 14 | 0 | 1 | 1 |
| **3 + aparência (cor) = `improved`** | **23** | **13,7 s** | 15 | 0 | 5 | 0 |

| 10 quadros/s | trilhas | mediana | >= 10 s | < 2 s | recomeços suspeitos | saltos impossíveis |
|---|---|---|---|---|---|---|
| 0 base | 45 | 5,8 s | 17 | 10 | 25 | 1 |
| 1 + nascimento exigente | 43 | 6,8 s | 17 | 8 | 23 | 1 |
| 2 + memória e recuperação | 16 | 38,6 s | 14 | 0 | 2 | 1 |
| 3 + aparência (cor) | 19 | 22,3 s | 15 | 0 | 3 | 1 |

"Recomeço suspeito" = uma trilha nasce logo depois (até 2,5 s) e perto de onde outra acabou, o que sugere a mesma pessoa
com número novo. "Salto impossível" = deslocamento dentro de uma trilha mais rápido do que se corre (mais de 4 alturas de
caixa por segundo), sinal de que duas pessoas foram juntadas numa só.

**Como ler isto, sem exagero:**
- **Não há anotação manual de identidades**, então **não existe taxa de acerto de IDs**. Os números são indicadores
  (proxies): menos trilhas, mais longas e menos recomeços sugerem menos trocas, mas **não provam**. Menos trilhas também
  pode ser fusão errada de pessoas diferentes; por isso o indicador de saltos (0 ou 1) e a cor entram como contrapeso,
  e ele só pega fusões que gerem salto, não as entre pessoas coladas.
- A recuperação sozinha (linha 2) deu o menor número de trilhas; a cor (linha 3) aceitou mais trilhas (23 contra 18) em
  troca de menos risco de fusão (0 saltos a 5 quadros/s). Escolhi a linha 3 como padrão por ser a mais conservadora. As
  duas configurações estão em `tools/compare_tracking.py` para trocar se a revisão visual preferir a 2.
- 10 quadros/s melhora pouco (19 contra 23 trilhas) e custa mais detecção; o padrão continua 5.
- **Conferência visual** (4 instantes do vídeo anotado, antes e depois): um atleta que caminha pela quadra manteve o mesmo
  número nos 4 instantes depois da melhoria (antes tinha trocado). **Ainda há trocas**: por exemplo, a pessoa na borda
  esquerda mudou de número entre 10 s e 14 s. O ganho vale para um trecho de 60 s de um único vídeo.
- Os 23 números ainda são mais que as 8 a 10 pessoas visíveis, e uma trilha nunca significa "o jogador X".

**Região de interesse (`--roi x1 y1 x2 y2 x3 y3 ...`, pixels do vídeo original):** quem tem os pés fora do polígono não ganha
trilha e sai no JSON com `in_roi: false` (continua listado, para a revisão futura). Serve para tirar treinador,
plateia e a quadra vizinha. **Não foi avaliada neste clipe**: nele não dá para saber, só olhando, quais pessoas pertencem
à "nossa quadra" (a rede aparece só à esquerda e a câmera está de lado), e não vou chutar uma região para fingir uma
melhoria. O mecanismo está testado; quem conhece a quadra define o polígono (use `calibrate-frame` para ver o quadro).

## Bola: teste de viabilidade (2026-10-20)

**Pergunta:** dá para rastrear a bola com o que já temos? **Resposta curta: não com o modelo atual.** O YOLOX do COCO tem a
classe "sports ball", e `tools/probe_ball.py` perguntou por ela no `amistoso1.mp4` (primeiros 30 s, 1 a cada 3 quadros,
298 quadros):

| | quadros com algum candidato | com candidato forte (>= 0,3) |
|---|---|---|
| quadro inteiro | 2 de 298 | 0 |
| 2 recortes ampliados (a bola fica maior para o modelo) | 27 de 298 | 8 |

Na conferência visual, **os candidatos mais fortes (0,5 a 0,7) são reflexos pequenos no piso, não a bola**, e a bola
verdadeira (visível, com cerca de 10 px, ao lado de um atleta aos 20 s) **não foi detectada**. A bola é pequena, rápida,
borrada e o ginásio é escuro. Não há anotação da posição da bola, então isto é contagem + olhar, não taxa de acerto.

**Caminho 2 testado: bola por movimento** (`tools/probe_ball_motion.py`, câmera fixa; primeiros 30 s, 30 quadros/s, 893
quadros). Primeiro conferi que a câmera está firme (deslocamento global de no máximo 0,21 px entre quadros). Depois:
diferença entre quadros, manchas pequenas e arredondadas, ligação por trajetória e filtro de comportamento de bola.

| | resultado |
|---|---|
| manchas candidatas por quadro | mediana 31, p95 66, máximo 89 |
| trilhas com comportamento de bola | 70 em 30 s (o jogo tem **uma** bola) |
| quadros com ao menos uma trilha "de bola" | 52% |
| verificação pontual (bola vista a olho aos 20 s) | 18 trilhas por perto, **0 com comportamento de bola** |

**Veredito: não serve sozinho.** A conferência visual mostra que as trilhas "de bola" estão em joelhos, mãos, pés e reflexos
do piso. E a única bola que eu conferi a olho (aos 20,1 s e 20,3 s, **no pé do jogador da direita**, depois levantada até a
mão aos 20,9 s) ficou de fora: perto de um corpo, o movimento da bola se funde com o das pernas e ela não vira uma mancha
isolada. É a situação mais comum no voleibol (bola na mão, no toque, no ataque). Isto vale para um único trecho de um
vídeo e uma única conferência manual, não é uma taxa de acerto.

**Conclusão e caminhos que sobram:**
1. **Treinar um detector pequeno de bola** com quadros do próprio Alpha7 anotados à mão (algumas centenas). É o caminho
   que os dois testes apontam: nenhum método "grátis" separa a bola de reflexos e membros neste ginásio. Exige uma
   ferramenta para marcar a bola (um clique por quadro), tempo de anotação e treino fora do fluxo atual (a fase 1
   proibia treino; é uma decisão nova). O movimento (caminho 2) pode ajudar depois como filtro, não como detector.
2. **Rastreadores especializados em bola (estilo TrackNet)**: também precisam desses dados anotados e tendem a ser lentos em
   CPU; só vale depois de ver o que o caminho 1 entrega.

## Modelo e licenças

Dois detectores atrás de uma interface (`video_analysis/detectors/base.py`); trocar o modelo é implementar
`PersonDetector` e registrar em `registry.py`.

| Opção | Código | Pesos | Precisão esperada em CPU | Observação |
|---|---|---|---|---|
| **OpenCV HOG** (`hog`, linha de base) | Apache-2.0 | coeficientes embutidos no OpenCV | baixa: foi feito para pedestres em pé e de frente | roda sem baixar nada; serve para validar o fluxo |
| **YOLOX** em ONNX (`yolox-onnx`, recomendado) | Apache-2.0 (verificado no repositório) | **licença não declarada à parte** no repositório; treino no COCO | boa para pessoas (mAP do COCO é o do modelo, **não** medido no Alpha7) | `.onnx` pronto nas releases do repositório, sem PyTorch; tamanho de entrada 640 (s) ou 416 (nano/tiny) |
| Ultralytics YOLO | **AGPL-3.0** (código); licença Enterprise paga existe | distribuídos pela Ultralytics, mesmos termos do projeto | boa | **não incluído**: a AGPL exige abrir o código de quem o distribui/serve em rede, incompatível com um produto fechado sem licença comercial |
| RF-DETR | Apache-2.0 | Nano/Small/Medium/Large: Apache-2.0; Atto/Femto/Pico/XL/2XL: PML 1.0 | medida em GPU (T4), CPU e ONNX **não confirmados** | candidato futuro; exigiria PyTorch ou exportação |

Fontes consultadas em 2026-10-20: páginas dos repositórios `Megvii-BaseDetection/YOLOX`, `ultralytics/ultralytics` e
`roboflow/rf-detr`. **Pendências de licença (não resolvidas por mim):** (1) a licença dos **pesos** do YOLOX não está
declarada; antes de qualquer uso além do teste interno, confirme com o Megvii ou escolha pesos com licença explícita.
(2) O COCO (dados de treino) tem anotações CC BY 4.0 e imagens do Flickr com licenças variadas. Não incluí nenhum peso no
repositório (`*.onnx` está no `.gitignore`).

Para usar o YOLOX: o `yolox_s.onnx` (35 858 002 bytes, SHA-256 `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`,
baixado em 2026-10-20 com autorização do dono do projeto) está em `models\` (ignorado pelo Git). Para obter de novo, baixe das
releases oficiais, por exemplo
`https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx` (também há `yolox_nano.onnx`,
mais leve e menos preciso), e rode com `--detector yolox-onnx --weights models\yolox_s.onnx`. O SHA-256 acima é o do arquivo que testei; não há um
hash publicado pelo repositório para comparar. O arquivo precisa ser o
export "cru" do YOLOX (saída 1 x N x 85); outro formato é recusado com uma mensagem explicando.

## Como ler o JSON (`alpha7.video-analysis/1`)

- `source`: nome (nunca o caminho), tamanho, resolução, fps, duração. `sha256` só com `--hash`.
- `processing`: configuração usada, detector (nome, versão, licenças, significado da confiança) e rastreador.
- `frames[]`: `frame_index` e `timestamp_ms` **do vídeo original**, `timestamp_source` (`container` ou `frame_index`
  quando o relógio do arquivo era implausível) e `detections[]` com `bbox_xyxy` (pixels do original), `confidence`,
  `track_id` (ou `null`), `anchor_xy` (centro da borda inferior da caixa) e `court_xy_m` (só com calibração).
- `tracks[]`: trajetórias por `track_id` (primeiro/último quadro, quantidade, trajetória `path`) e
  `identity: {athlete_id: null, status: "unassigned"}`, que fica vazio até uma revisão humana.
- `link`: `match_id`, `video_id`, `notes` (nulos), reservados para a futura tela de revisão ligar o vídeo a uma partida.
- `calibration`: `not_calibrated` ou os pontos usados. `summary`: quadros, detecções, trilhas, tempos e erros.
- `disclaimers`: os avisos acima, dentro do próprio arquivo.

A confiança **não é comparável entre detectores** (o HOG usa uma sigmoide da margem do SVM; o YOLOX, objectness x
classe). Cada uma vem explicada em `processing.detector.confidence_semantics`.

`python -m video_analysis validate saida\gravacao.analysis.json` confere a estrutura.

## Calibração da quadra (estrutura preparada, **não é análise tática**)

Marque à mão os 4 cantos de uma região plana conhecida do chão (por exemplo, a meia quadra de 9 m x 9 m), em pixels do
**vídeo original**, na ordem topo-esquerda, topo-direita, base-direita, base-esquerda. Nada é deduzido: a imagem
inteira nunca é tratada como a quadra.

```powershell
python -m video_analysis calibrate-frame --input gravacao.mp4 --at 5 --output quadro.png
# abra quadro.png num visualizador, anote os 4 cantos, e confira a marcação:
python -m video_analysis calibrate-check --input gravacao.mp4 --points 100 60 220 60 300 220 20 220 --width-m 9 --length-m 9 --save quadra.json --preview previa.png
python -m video_analysis --input gravacao.mp4 --output saida --calibration quadra.json
```

Confira `previa.png`: a grade de 1 m precisa acompanhar as linhas reais do chão. Com a calibração, cada detecção ganha
`court_xy_m`. **Limite:** o ponto usado é o centro da borda inferior da caixa; só aproxima os pés quando a pessoa está
em pé (no salto ou no mergulho erra) e a câmera de celular fixa pode ter distorção de lente que não é corrigida.

## Limitações conhecidas

- IDs de trilha ainda trocam em cruzamentos e oclusões (menos do que na fase 1, ver acima), e uma pessoa que some por
  mais de 30 quadros processados ganha número novo. O rastreador usa posição, tamanho e a cor do tronco como desempate
  (nunca rosto nem número da camisa). Uniformes parecidos e pouca luz reduzem o valor da cor.
- O detector pode falhar com atletas agachados, saltando, de costas, muito pequenos (fundo da quadra) ou com
  espectadores e treinadores em quadro: **a análise detecta qualquer pessoa**, não só os seis jogadores.
- O vídeo anotado usa o codec `mp4v`: abre no VLC e no Windows Media Player, mas navegadores podem não tocar (H.264
  exigiria uma biblioteca externa que o OpenCV não traz).
- Vídeos de celular com taxa de quadros variável: usamos o relógio do arquivo quando plausível; os quadros em que isso
  não aconteceu são contados em `summary.timestamps_from_frame_index`.
- A busca por `--start` pula para o quadro pedido, o que em alguns codecs cai no quadro-chave mais próximo.

## Desempenho observado (esta máquina, não representa outras)

Intel Core i5-1235U (10 núcleos, 12 threads), 7,7 GB de RAM (cerca de 1,2 GB livres na hora do teste), sem GPU
dedicada (Iris Xe integrada, não usada), Windows 11, Python 3.14, OpenCV 4.14, onnxruntime em CPU.

- **Gravação real** (848x478, primeiros 60 s, 5 quadros/s = 298 quadros processados, tamanho original):
  **YOLOX-s: 39,4 s (132 ms por quadro processado, 1,52x o tempo real)**; HOG: 25,1 s (84 ms por quadro, 2,39x). Os
  tempos incluem leitura, desenho e gravação do vídeo anotado. Processar o jogo inteiro leva, portanto, mais ou menos o
  tempo do jogo (YOLOX a 5 quadros/s), em CPU.
- Mesmo trecho com o rastreador `improved` (histogramas de cor incluídos): 31,0 s (104 ms por quadro, 1,93x o tempo real;
  a variação entre execuções vem da carga da máquina e do cache de disco). O custo do rastreador em si é pequeno (cerca de
  1 s para os 298 quadros).
- Clipe sintético 1280x720 de 30 s: YOLOX-s 178,6 ms por quadro; HOG 168 ms (nesse tamanho, com redução para 960 de largura).

## Testes

```powershell
.\.venv\Scripts\python.exe -m pytest tests
```

81 testes com arquivos **sintéticos** (vídeo inexistente, arquivo inválido ou vazio, truncado, metadados, quadros e
tempos preservados, `--stride`, trecho, rastreador, decodificação do YOLOX com saída sintética, JSON e seu validador,
recuperação de trilha, cor, nascimento exigente e ROI, falhas do detector isoladas por quadro e parada após 10 seguidas, vídeo anotado gravado e fechado mesmo com falha, calibração, CLI).

`tests/test_real_video.py` é o teste em **gravação real**: só roda se `ALPHA7_REAL_VIDEO` apontar para um arquivo
(opcional `ALPHA7_REAL_WEIGHTS`). Ele não mede precisão; confere que a análise termina e gera JSON válido. A qualidade
se avalia assistindo ao vídeo anotado.

## Estrutura

```
video_analysis/
  video_io.py     leitura, validação, quadros e tempos       detectors/   base, hog, yolox_onnx, registry
  tracking.py     rastreador (IoU + predição de movimento)   calibration.py  calibração manual de 4 pontos
  render.py       sobreposição e vídeo anotado               export.py    JSON, validação e resumo
  pipeline.py     fluxo completo                             cli.py       linha de comando
appearance.py     histograma de cor do tronco (só desempate)
tools/compare_tracking.py   compara configurações do rastreador sobre as mesmas detecções
tests/            pytest (sintéticos) + teste opcional com vídeo real
```
