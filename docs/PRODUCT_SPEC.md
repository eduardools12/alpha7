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
| Analista / auxiliar (registro em quadra) | Registrar fundamentos em treino e pontos em partida pelo celular, com rapidez | Planejado (referências 06 e 08) |
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
| Treinos | Treino com vários exercícios, registro rápido de fundamentos com desfazer, presença, intensidade | Planejado |
| Partidas | Placar por set, saque e rotação, rallies com motivo do ponto, correções com histórico | Planejado |
| Estatísticas | Taxas de ace, ataque, side-out, bloqueio; recepção A/B/C/erro; comparação de atacantes; exportar relatório | Planejado |
| Dados | Persistência em localStorage, restaurar demonstração, apagar tudo | Feito (provisório) |
| Dados | Supabase (Postgres, autenticação, imagens), multiusuário, backup | Planejado |

### Limitações conhecidas da escalação (Parcial)

Implementado: não duplicar atleta; mover/trocar; líbero de ofício fora das zonas; papel tático diferente da posição habitual; ordem de saque P1 a P6; rodízio horário em prévia; avisos de lesionado, formação (5-1, 4-2, 6-2) e papel incoerente.

**Ainda não implementado:** troca do líbero com jogadores da linha de fundo e suas restrições; limite e controle de substituições por set; faltas de posição (sobreposição) entre zonas; rodízio durante a partida (depende do módulo de partidas); mais de um set/escalação por jogo; formações com mais de um líbero.

## 4. Escopo

**Primeira entrega (v0.1, concluída):** tudo marcado Feito e Parcial acima.

**Fora do escopo da v0.1:** backend, autenticação, upload de fotos, treinos, partidas, estatísticas reais, gerador de artes, exportação de relatórios, notificações.

## 5. Prioridades (próximas etapas, em ordem)

1. **Treinos** (referência 06): registro rápido de fundamentos com desfazer e critérios de recepção validados. Gera os primeiros dados observados reais.
2. **Backend Supabase** com RLS por equipe e migração do localStorage (o contrato `DataGateway` já isola a troca).
3. **Partidas** (referência 08): sets, rallies, correções.
4. **Estatísticas** (referência 07): calculadas dos registros válidos, com contexto de tentativas.
5. **Gerador de artes** (referência 05) a partir de uma escalação salva.
6. Fotos dos atletas (Storage) e autenticação por papéis.

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

### Módulos futuros (resumo; detalhar antes de implementar)

- **Treinos:** registrar um fundamento cria exatamente 1 tentativa; desfazer remove a última sem apagar o histórico; estatísticas só usam registros válidos; critérios A/B/C/erro visíveis na tela.
- **Partidas:** placar respeita o formato da competição; cada ponto tem motivo (ou "não informado"); correção gera nova versão e preserva a anterior.
- **Estatísticas:** todo percentual exibe "x de y"; sem tentativas, "indisponível".
