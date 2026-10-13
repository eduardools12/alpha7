# Especificação do produto

Legenda de estado: **Feito** (implementado e testado na v0.1) · **Parcial** (implementado com limitações listadas) · **Planejado** (só especificado).

## 1. Objetivo

Dar à comissão técnica do Alpha7 um lugar único para **conhecer o elenco**, **montar escalações** e, nas próximas etapas, **registrar treinos e partidas** e **analisar o desempenho** com dados confiáveis. O valor está na qualidade dos dados: nada de números decorativos.

Princípios:

1. Nota técnica (julgamento do treinador) é separada de estatística (registro observado).
2. Toda métrica é explicável pela fórmula e mostra o contexto (tentativas).
3. Ausência de dado nunca vira zero.
4. A arquitetura não depende de nomes ou regras de um único elenco.

## 2. Usuários

| Usuário | Necessidade | Estado |
|---|---|---|
| Treinador / comissão técnica | Avaliar atletas, escalar, planejar | Atendido (elenco, avaliações, escalação) |
| Analista / auxiliar (registro em quadra) | Registrar fundamentos em treino e pontos em partida pelo celular, com rapidez | Treino: atendido (referência 06). Partida: planejado (referência 08) |
| Atleta | Consultar o próprio perfil e evolução | Planejado (exige autenticação) |

Uso inicial: uma equipe, uma pessoa por vez, no celular e no computador. Sem login na v0.1.

## 3. Funcionalidades

| Área | Funcionalidade | Estado |
|---|---|---|
| Base | Menu lateral (desktop) e barra inferior (celular), rotas, identidade visual | Feito |
| Base | Estados de carregamento, vazio, erro e sucesso; dados de demonstração identificados | Feito |
| Elenco | Cartas esportivas, busca por nome/número, filtro por posição e situação (na URL) | Feito |
| Elenco | Cadastro e edição (nome, camisa única, posição principal/secundária, situação, uniforme, observações) com validação | Feito |
| Elenco | Perfil: atributos, evolução do Overall, histórico, análise técnica, "como o Overall foi calculado" | Feito |
| Avaliação | 9 atributos de 1 a 99, nova avaliação datada sem sobrescrever as anteriores, prévia do Overall e da variação | Feito |
| Avaliação | Overall por posição com pesos provisórios editáveis em Configurações | Feito |
| Escalação | Editor: 6 titulares, líbero, reservas, papel tático, ordem de saque base, prévia do rodízio, salvar, listar, excluir | Parcial |
| Escalação | Gerador de arte (pôster, referência 05) | Planejado |
| Dashboard | Indicadores de elenco e Overall médio, destaques e evolução (reais); treinos e partidas (demonstração) | Parcial |
| Treinos | Criar, editar, excluir e listar treinos (nome, data, duração, descrição, observações, responsável), participantes do elenco, vários exercícios, conclusão/reabertura | Feito (v0.2) |
| Treinos | Registro rápido de tentativas por fundamento (saque, recepção, levantamento, ataque, bloqueio, defesa), com feedback, histórico recente e desfazer | Feito (v0.2) |
| Treinos | Resumo pós-treino: estatísticas por fundamento com tentativas e denominadores, distribuição da recepção, eficiência de ataque, qualidade do levantamento, resultados individuais, comparação com limite de amostra | Feito (v0.2) |
| Treinos | Intensidade da sessão, presença separada da lista de participantes, plano de treino (carga, objetivos) | Planejado |
| Partidas | Placar por set, saque e rotação, rallies com motivo do ponto, correções com histórico | Planejado |
| Estatísticas | Taxas de ace, ataque, side-out, bloqueio; recepção A/B/C/erro; comparação de atacantes; exportar relatório | Planejado |
| Dados | Persistência em localStorage, restaurar demonstração, apagar tudo (com painel de impacto, confirmação e desfazer) | Feito (provisório) |
| Dados | Backup em arquivo JSON com versão de formato e checksum; importação segura com prévia e confirmação; cópia automática antes de substituir; verificar integridade; lembrete de backup | Feito (v0.3). Ver `DATA_SAFETY.md` |
| Dados | Supabase (Postgres, autenticação, imagens), multiusuário, sincronização | Planejado |

### Limitações conhecidas da escalação (Parcial)

Implementado: não duplicar atleta; mover/trocar; líbero de ofício fora das zonas; papel tático diferente da posição habitual; ordem de saque P1 a P6; rodízio horário em prévia; avisos de lesionado, formação (5-1, 4-2, 6-2) e papel incoerente.

**Ainda não implementado:** troca do líbero com jogadores da linha de fundo e suas restrições; limite e controle de substituições por set; faltas de posição (sobreposição) entre zonas; rodízio durante a partida (depende do módulo de partidas); mais de um set/escalação por jogo; formações com mais de um líbero.

## 4. Escopo

**Primeira entrega (v0.1, concluída):** elenco, avaliações, Overall, escalações, dashboard.

**Módulo de Treinos (v0.2, concluído):** tudo marcado "Feito (v0.2)" acima. Persistência continua em `localStorage` (sem Supabase, sem sincronização).

**Proteção dos dados (v0.3, concluída):** auditoria da persistência (`DATA_SAFETY.md`), backup e restauração seguros, cópia automática com desfazer, proteção do "Restaurar demonstração". Sem funcionalidade nova de esporte e sem Supabase.

**Fora do escopo até aqui:** backend, autenticação, upload de fotos, partidas, estatísticas consolidadas por período, gerador de artes, exportação de relatórios, notificações.

## 5. Prioridades (próximas etapas, em ordem)

1. **Validar com a comissão técnica** os critérios de registro adotados (`docs/METRICS.md`, seção C): recepção A/B/C/erro, levantamento, "outra tentativa" no ataque e o limite de amostra. Os números do módulo de treinos dependem dessas definições.
2. **Backend Supabase** com RLS por equipe e migração do localStorage (o contrato `DataGateway` já isola a troca; `DATA_MODEL.md` traz o SQL proposto).
3. **Partidas** (referência 08): sets, rallies, correções, reaproveitando a taxonomia de fundamentos (eventos em coleção própria).
4. **Estatísticas** (referência 07): consolidação entre treinos, com recortes de período e evolução.
5. **Gerador de artes** (referência 05) a partir de uma escalação salva.
6. Fotos dos atletas (Storage) e autenticação por papéis (e então "responsável" deixa de ser texto livre).

## 6. Critérios de aceitação

### Primeira entrega (verificados por testes automatizados e conferência visual)

- [x] Abrir localmente e navegar por Dashboard, Elenco, Escalações, Treinos, Partidas, Estatísticas e Configurações.
- [x] Cadastrar e editar jogador; campos inválidos são recusados com mensagem por campo e foco no primeiro erro; camisa duplicada é recusada dizendo quem a usa.
- [x] Consultar o perfil; alterar atributos registrando nova avaliação; o histórico anterior permanece.
- [x] Ver o Overall calculado, entender a fórmula e mudar os pesos por posição, com efeito imediato nos Overalls.
- [x] Montar e salvar uma escalação com seis titulares sem duplicação; corrigir a seleção.
- [x] Dados de demonstração identificados (etiqueta e faixa) e removíveis.
- [x] Atleta sem avaliação e métricas sem registros aparecem como "—", nunca 0.
- [x] Funciona de 360px a 1920px sem rolagem horizontal; navegação por teclado; alvos de toque de 44px.
- [x] Tipos, testes e build passam.

### Módulo de Treinos (v0.2: verificados por testes automatizados e conferência visual)

- [x] Criar, editar e excluir treinos; cada treino tem identificação própria; exercícios e participantes (do elenco) ficam ligados ao treino.
- [x] Editar nome, descrição ou observações **preserva** todos os registros; exercício ou participante com registros não pode ser removido.
- [x] Excluir pede confirmação com a contagem do que será apagado e remove, em cascata, só os exercícios e registros daquele treino.
- [x] Registrar um resultado cria exatamente 1 tentativa vinculada a treino, exercício, jogador, fundamento, resultado, data e hora.
- [x] Jogador, exercício e fundamento permanecem selecionados entre registros; feedback visual e textual a cada toque; histórico recente.
- [x] Toque duplo acidental não duplica; desfazer anula só o último registro (preservando o histórico) e repetir o toque não desfaz dois.
- [x] Os registros persistem após recarregar; falha de gravação avisa e não deixa registro pela metade.
- [x] Fórmulas de saque, recepção (distribuição e nota interna), levantamento, ataque (eficiência), bloqueio e defesa calculadas só de registros válidos, com tentativas e denominadores; sem tentativas = "—", nunca 0%.
- [x] A qualidade do levantamento é um indicador separado do resultado do ataque.
- [x] Amostra insuficiente (menos de 10 tentativas) é sinalizada; comparação entre participantes só entre quem tem amostra adequada e apenas com 2 ou mais atletas nessa condição.
- [x] Critérios de cada resultado visíveis na tela de registro.
- [x] Usável no celular: painel de resultado fixo ao alcance do polegar, alvos de 44px, sem rolagem horizontal da página.
- [x] Registrar tentativas não altera notas técnicas nem Overall.

### Proteção dos dados (v0.3: verificados por testes automatizados, inclusive em navegador real)

- [x] Exportar backup é ação explícita; o arquivo tem nome com data e hora, identificador e versão de formato, e contém o workspace inteiro (atletas, avaliações, escalações, configurações, treinos, exercícios, registros) sem segredos.
- [x] Ida e volta exporta/importa preserva avaliações e histórico, vínculos treino ↔ exercício ↔ atleta ↔ registro e registros desfeitos.
- [x] Arquivo inválido, de outro formato, de versão futura, truncado ou adulterado é recusado e **não altera nada**.
- [x] Importar mostra prévia (backup × atual), avisa que substitui tudo e exige confirmação; cancelar não altera nada.
- [x] Falha durante a restauração (sem espaço, erro de gravação) não deixa dados pela metade.
- [x] "Restaurar demonstração" e "Apagar todos os dados" descrevem o impacto, recomendam backup e exigem confirmação; o conteúdo anterior fica guardado para desfazer.
- [x] Funcionalidades anteriores seguem funcionando (suíte completa).
- [ ] **Aberto:** a proteção contra perda do aparelho/navegador depende de a pessoa guardar o arquivo (ver riscos em `DATA_SAFETY.md`).

### Módulos futuros (resumo; detalhar antes de implementar)

- **Partidas:** placar respeita o formato da competição; cada ponto tem motivo (ou "não informado"); correção gera nova versão e preserva a anterior.
- **Estatísticas:** todo percentual exibe "x de y"; sem tentativas, "indisponível".
