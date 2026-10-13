# Segurança dos dados

Auditoria da persistência do Alpha7 antes do uso com dados reais da equipe, e as proteções implementadas nas versões 0.3, 0.3.1 e 0.4.0 (esta última, o backend Supabase opcional: seção 10). Escrito a partir do código (`src/data/`, `src/features/settings/`) e dos testes; onde algo é limite ou risco que **continua existindo**, está dito.

> **Resumo.** Os dados vivem só no `localStorage` deste navegador. Não há servidor, nuvem nem sincronização. Quem apaga os dados do navegador, troca de perfil/aparelho ou perde o disco perde tudo, **a não ser que tenha um backup em arquivo**. A v0.3 acrescenta backup e restauração validados, cópia de segurança automática antes de qualquer substituição, confirmação com descrição do impacto e verificação de integridade. A migração para o Supabase **não** foi iniciada.
>
> **Desde a 0.3.1 o aplicativo nunca cria dados de demonstração por conta própria.** Sem workspace, ele pergunta (primeira utilização) ou abre uma tela de recuperação (há sinais de que já existiu). Ver a seção 7. **Limite:** o `localStorage` não permite detectar toda perda de dados; se o navegador apagar tudo do site, o caso é indistinguível de uma primeira utilização.

## 1. Como os dados são guardados

| Item | Valor |
|---|---|
| Onde | `localStorage` do navegador, por **origem** (endereço + porta). Outro endereço, navegador, perfil ou aparelho enxerga um workspace diferente (vazio ou de demonstração) |
| Chave principal | `alpha7.workspace.v1` → JSON `{ version: 1, players, evaluations, lineups, settings, activity, trainings, exercises, trainingEvents }` |
| Outras chaves | `…v1.snapshot` (cópia da última substituição), `…v1.corrupt` (cópia de dado ilegível), `…v1.seen` (marca de que este navegador já teve um workspace), `alpha7.lastBackup.v1` (metadado do último backup). Ver [DATA_MODEL.md](DATA_MODEL.md) |
| Gravação | Cada alteração regrava o JSON inteiro numa única chamada `setItem` (tudo ou nada) |
| Limite | Cerca de 5 milhões de caracteres por site (varia por navegador). A tela Configurações mostra o uso e avisa a partir de 70% |
| Sem armazenamento | Em modo restrito/privado o app funciona **só em memória** e avisa na faixa superior; fechar a aba perde tudo. Sem armazenamento não há como saber de uso anterior: sempre abre na escolha de primeira utilização |
| Segredos | Nenhum. O app não usa chaves, tokens nem senhas; o backup não contém nenhum (há teste) |

## 2. Achados da auditoria (estado anterior à v0.3) e o que foi feito

Gravidade: **A** pode causar perda de dados reais; **M** pode causar perda ou dado incorreto em situações específicas; **B** conforto/clareza.

| # | Achado | Grav. | Situação |
|---|---|---|---|
| 1 | **Não havia backup nem como tirar os dados do navegador.** Qualquer limpeza de dados do site, perfil novo ou troca de computador apagava histórico de avaliações e treinos | A | **Resolvido** parcialmente: exportação em arquivo (seção 4). Continua dependendo de a pessoa exportar e guardar o arquivo; há lembrete (seção 8) |
| 2 | **"Restaurar demonstração" e "Apagar todos os dados" substituíam o workspace inteiro**, inclusive o que a equipe cadastrou, com um texto de confirmação genérico, sem recomendar backup e sem como voltar | A | **Resolvido**: painel com o impacto descrito, recomendação e botão de backup, caixa "Entendi…" quando há dados reais, e **cópia de segurança automática** com "Desfazer" (seção 6) |
| 3 | **Excluir um treino apaga em cascata exercícios e todos os registros** (válidos e desfeitos). A tela informava as contagens, mas não havia volta | M | **Mitigado**: o gateway guarda a cópia de segurança antes de excluir (e aborta se não conseguir). "Desfazer última substituição" recupera. Só a última fica guardada |
| 4 | **Se a chave principal sumisse** (navegador limpou o armazenamento, dado evicto), a próxima abertura **semeava a demonstração em silêncio**, parecendo um app novo | A | **Resolvido nos casos detectáveis (0.3.1)**: o app não semeia mais nada. Primeira utilização = escolha explícita; workspace ausente com sinais de uso anterior ou dado ilegível = tela de recuperação (seção 7). Também pedimos armazenamento persistente (`navigator.storage.persist()`). **Limite que permanece**: se TODOS os dados do site forem apagados (inclusive a marca de uso), o app mostra a escolha de primeira utilização, e a pessoa só percebe pelo contexto. O backup em arquivo é a defesa real |
| 5 | **Dado ilegível**: o app já recusava abrir e guardava cópia em `…corrupt`, mas a única saída era recomeçar | M | **Melhorado**: a tela de recuperação explica que nada foi apagado, permite **baixar o texto ilegível** e só então recomeçar (em dois passos). Na 0.3.1 ela também oferece importar backup, restaurar a cópia automática e tentar de novo (seção 7). O texto antigo também vai para a cópia de segurança |
| 6 | **Leitura frágil**: ao abrir, o app só conferia o formato superficial (`looksLike…`). Vínculos quebrados (avaliação de atleta inexistente, evento de outro treino), camisas repetidas ou chaves duplicadas **passavam** | M | **Resolvido para o backup e para o diagnóstico**: a mesma validação estrita (seção 5) roda na exportação, na importação e em "Verificar integridade dos dados". **Não** bloqueia a abertura normal (evita travar quem já tem dados), mas a exportação **recusa** gerar backup de dado inconsistente e oferece baixar a cópia bruta |
| 7 | **Pesos do Overall inválidos eram trocados em silêncio pelos padrões** ao abrir (`readWeights`) e gravados por cima na próxima alteração | M | **Aberto (baixo risco)**: só ocorre se o JSON salvo for editado à mão ou corrompido. O backup valida os pesos e **recusa** pesos inválidos em vez de trocá-los. Não alteramos o comportamento de abertura para não mudar funcionalidade sem necessidade |
| 8 | **Duas abas abertas**: cada uma lê o workspace uma vez e regrava o conjunto inteiro; a última a gravar vence e pode apagar o que a outra fez | M | **Mitigado**: o app escuta o evento `storage` e recarrega em silêncio quando outra aba grava; `savePlayer` revalida a camisa única contra o dado atual. **Risco residual**: se as duas abas gravarem quase ao mesmo tempo, a última vence (sem bloqueio entre abas). Use uma aba por vez |
| 9 | **Restaurar a demonstração zerava os pesos do Overall** personalizados | B | **Resolvido**: os pesos atuais são mantidos em "Restaurar demonstração" e em "Apagar tudo" |
| 10 | **Sem versão do app visível**, difícil dizer de que versão veio um arquivo | B | **Resolvido**: `src/version.ts` (igual ao `package.json`, com teste; hoje 0.4.0), exibida na barra lateral e gravada no backup |
| 11 | **Camisa única só era garantida na tela** do cadastro | B | **Resolvido**: o gateway recusa (`IntegrityError`) camisa já usada por outro atleta |

### O que cada ação destrutiva sobrescreve

| Ação | O que substitui | Proteção |
|---|---|---|
| Restaurar dados de demonstração | **Tudo** (atletas, avaliações, escalações, treinos, exercícios, registros); mantém os pesos | Painel de impacto + recomendação de backup + checkbox (se há dado real) + cópia automática + desfazer |
| Apagar todos os dados | **Tudo**; mantém os pesos | Idem |
| Restaurar backup (importar) | **Tudo** | Prévia lado a lado, aviso, recomendação de backup, checkbox + cópia automática + desfazer |
| Excluir um treino | Treino, seus exercícios e todos os seus registros | Contagens na confirmação + cópia automática + desfazer |
| Desfazer última substituição | Tudo, pelo conteúdo da cópia | Confirmação; o conteúdo atual vira a nova cópia (dá para ir e voltar) |
| Editar/arquivar atleta, nova avaliação, escalação, treino, registro | Apenas o item | Não substituem o resto. Avaliações são **somente acrescentadas**; registros são **anulados**, nunca apagados individualmente |

### Perguntas da auditoria, respondidas

- **Atletas, avaliações, treinos, exercícios e registros podem se perder?** Sim, por: limpeza do navegador, dado evicto por falta de espaço, perda do aparelho, substituição do workspace (com cópia de uma vaga) e exclusão de treino (idem). Não se perdem por edição normal.
- **Dados antigos após mudança de modelo?** Campos novos são **aditivos**: dados sem `trainings`/`exercises`/`trainingEvents` abrem com listas vazias. Versão de esquema desconhecida (`version` ≠ 1) é tratada como dado ilegível (copiado, nunca apagado) e **não** é migrada em silêncio. Quando o esquema mudar, a mudança deve vir com função de migração e teste.
- **O que preservar para o Supabase?** Ver seção 9.

## 3. Camadas de proteção implementadas

1. **Validação estrita compartilhada** (`validateWorkspace`): exportar, importar e verificar usam as mesmas regras.
2. **Backup em arquivo** com identificação de formato, versões e checksum.
3. **Importação "parse, don't validate"**: o arquivo vira uma proposta de workspace; nada é gravado até a confirmação.
4. **Cópia de segurança automática** antes de qualquer substituição ou exclusão de treino; se não puder ser guardada, a operação **é abortada** sem alterar nada.
5. **Gravação atômica**: uma única `setItem`. Falhou (cota, erro) → o conteúdo anterior continua intacto.
6. **Desfazer** a última substituição, indo e voltando.
7. **Verificação de integridade** sob demanda e **lembrete** de backup.

## 4. Backup: formato do arquivo

Nome: `alpha7-backup-AAAA-MM-DD-HHmm.json` (data e hora **locais**, para dois backups do mesmo dia não se sobrescreverem). Exportar é sempre uma ação explícita (botão "Exportar backup"); o app nunca baixa nada sozinho.

```jsonc
{
  "format": "alpha7-backup",          // identifica o tipo de arquivo
  "formatVersion": 1,                  // versão do FORMATO do arquivo
  "appVersion": "0.4.0",               // versão do app que exportou (informativa)
  "workspaceSchemaVersion": 1,         // versão do esquema dos dados
  "exportedAt": "2026-10-12T21:05:00.000Z",
  "counts": { "players": 18, "evaluations": 40, ... },   // para a prévia e conferência
  "checksum": { "algorithm": "sha256", "value": "…" },   // do corpo "workspace" canonicalizado
  "workspace": {
    "players": [], "evaluations": [], "lineups": [], "settings": {}, "activity": null,
    "trainings": [], "exercises": [], "trainingEvents": []
  }
}
```

- **Exporta o workspace inteiro**: atletas, avaliações (histórico completo), escalações, configurações (pesos), atividade de demonstração, treinos, exercícios (e participantes, dentro do treino), registros de treino (inclusive os desfeitos, com `voidedAt`).
- **Valida antes de exportar** a partir de uma leitura nova do armazenamento. Se houver inconsistência, **não gera arquivo** (backup inconsistente daria falsa segurança); a tela lista os problemas e oferece baixar a cópia bruta do que está salvo.
- **Sem segredos**: nenhum token, chave ou credencial existe no app; o teste "sem segredos" confere o JSON.
- **Checksum SHA-256** do corpo com chaves ordenadas. Serve para detectar **arquivo truncado, editado por engano ou corrompido**. **Não é segurança**: quem altera o arquivo de propósito pode recalcular o hash. Por isso a validação estrita roda mesmo com o hash correto (há testes com arquivos forjados com hash válido).
- **Não é criptografado**: contém nomes e avaliações de atletas. Guarde em local de acesso restrito. Se algum atleta for menor de idade, trate o arquivo como dado pessoal sensível.

## 5. Importação segura

Fluxo: escolher arquivo → leitura e validação (nada é gravado) → **prévia** → aviso de substituição + recomendação de backup → confirmação explícita → cópia de segurança → gravação atômica → mensagem de sucesso (ou de erro, "nada foi alterado").

Verificações, em ordem, e qualquer falha **rejeita o arquivo inteiro** (sem importação parcial):

1. Tamanho (até 25 MB) e JSON válido; BOM é aceito.
2. `format === "alpha7-backup"`.
3. `formatVersion` inteiro ≥ 1 e **não maior** que o suportado.
4. Cadeia de migração do formato (hoje vazia, só existe a v1).
5. `exportedAt`, `appVersion` e `workspaceSchemaVersion` válidos e compatíveis.
6. Checksum presente e igual ao recalculado.
7. **Validação estrita do corpo**, reconstruindo cada objeto **só com os campos conhecidos** (campos desconhecidos são descartados e avisados; `__proto__` e afins nunca são copiados): tipos, faixas (atributos 1–99, camisa 1–99), enumerações (posição, status, formação, fundamento/resultado), datas reais (AAAA-MM-DD reais, ISO com hora), textos com limite, pesos válidos, até 200 mil registros.
8. **Vínculos e unicidade**: ids únicos por coleção; camisa única; avaliação → atleta existente; escalação sem repetir atleta e só com atletas existentes; treino → participantes existentes; exercício → treino existente; registro → treino, exercício **do mesmo treino** e atleta **participante** (para registros válidos); resultado compatível com o fundamento; `attemptKey` única.

A tela mostra no máximo 25 problemas e o total. Erros de validação nunca alteram o workspace.

A **prévia** mostra, lado a lado, backup × workspace atual (atletas, avaliações, escalações, treinos, exercícios, registros válidos e desfeitos), a origem (demonstração × dados da equipe), data de exportação e versão do app, e avisos (campos descartados). O botão "Restaurar este backup" só habilita depois da confirmação; com dado real no workspace atual exige a caixa "Entendi…".

### Compatibilidade de versões

| Situação | Comportamento |
|---|---|
| `formatVersion` igual ao atual (1) | Aceito |
| `formatVersion` **mais novo** | **Recusado** com mensagem pedindo para atualizar o app (nunca "tenta entender") |
| `formatVersion` mais antigo | Passa por `MIGRATIONS[v]` até o atual; sem migração para algum degrau, **recusado** como incompatível. Hoje a tabela é vazia: ao criar o formato 2, adicionar `MIGRATIONS[1]` e um teste com um arquivo v1 fixo |
| `workspaceSchemaVersion` ≠ atual | Recusado |
| Campos desconhecidos em arquivo da mesma versão | Descartados, com aviso na prévia |
| Dados no navegador com `version` ≠ 1 | Tratados como ilegíveis (copiados para `…corrupt`, nunca apagados) |

Regra para evoluir: campo novo **opcional/aditivo** não exige mudar a versão (campo ausente → valor padrão); mudar significado, remover ou renomear campo exige nova versão **e** migração testada.

## 6. Cópia de segurança automática e "Desfazer"

- Antes de `replaceWorkspace` (demonstração, apagar tudo, importar, recuperação) e de `deleteTraining`, o gateway grava em `alpha7.workspace.v1.snapshot` o **texto exato** anterior, o motivo e a hora.
- Se essa gravação falhar (cota cheia), a operação principal **não acontece** (`IntegrityError`: "Nada foi alterado").
- Só **uma** cópia fica guardada; a próxima substituição a troca. "Desfazer" devolve o conteúdo anterior **e guarda o atual** como nova cópia.
- A cópia ocupa espaço do mesmo limite do navegador (mostrado na tela).
- **A cópia não substitui o backup em arquivo**: vive no mesmo navegador e some junto com ele.

## 7. Inicialização e recuperação do workspace (0.3.1)

O gateway **nunca cria dados sozinho**. `load()` lê o armazenamento e, conforme o que encontra, a interface mostra uma de quatro situações:

| Situação | O que o app encontra | O que a pessoa vê | O que é gravado |
|---|---|---|---|
| **Workspace existente** | Chave `alpha7.workspace.v1` legível | O aplicativo, normalmente | Nada, exceto a marca de uso (`…v1.seen`) se ainda não existir (dados criados em versões anteriores a recebem ao abrir) |
| **Primeira utilização** | Sem workspace **e** sem nenhum sinal de uso anterior | Tela "Como você quer começar?": **workspace vazio**, **dados de demonstração** ou **restaurar de um backup** | **Nada** antes da escolha |
| **Workspace ausente** (`lost`) | Sem workspace, mas com sinal de uso anterior: marca de uso, cópia de segurança, cópia de dado ilegível ou registro de backup | Tela "Recuperar os dados da equipe" | **Nada**; nenhuma demonstração é criada |
| **Dado ilegível ou incompatível** (`unreadable`) | A chave existe, mas não passa na leitura (JSON inválido, listas malformadas, `version` desconhecida) | A mesma tela de recuperação, com o motivo | Só a cópia do texto ilegível em `…v1.corrupt` (preserva, não substitui) |

**Tela de recuperação**, em ordem: (1) **Importar um backup** (mesma prévia e validação da importação em Configurações); (2) **Cópia de segurança automática**, se existir, com o que ela contém e botão de restaurar; (3) **Baixar os dados brutos**: um botão para cada texto que ainda existir (dados salvos, cópia do ilegível, cópia automática), ou aviso de que não há nada; (4) **Tentar novamente**, que lê o armazenamento de novo; (5) **Começar um workspace novo**, atrás de uma confirmação explícita que oferece vazio ou demonstração e só então grava.

**Garantias** (cobertas por testes de unidade e de navegador):

- Nenhum caminho de falha ou ausência grava demonstração sem a pessoa escolher. Gravar quando o workspace sumiu com o app aberto (outra aba, limpeza) é **recusado** em vez de recriar dados (`IntegrityError`).
- Prévia, cancelar, arquivo inválido e "tentar novamente" **não gravam nada**. Falha de gravação na importação ou no início de um workspace novo deixa o armazenamento como estava.
- Começar um workspace novo sobre dado ilegível guarda antes o texto na cópia de segurança; se ela não puder ser gravada, a operação é abortada.
- Depois de sair da tela de início ou de recuperação, o foco do teclado vai para o conteúdo principal.

**Demonstração identificada.** A base de demonstração só entra por escolha explícita, vem toda marcada (`demo: true`, etiqueta "Demo") e a faixa "Dados de demonstração" aparece enquanto existir. Se a equipe cadastrar registros reais no mesmo workspace, a faixa passa a avisar que há **demonstração misturada com dados da equipe** (totais e médias somam os dois), com o caminho para limpar em Configurações. Misturar continua permitido, mas nunca em silêncio.

**Inconsistência não bloqueia a abertura.** Dados legíveis, porém com vínculos quebrados (por exemplo, avaliação de atleta inexistente), abrem normalmente, para não deixar a equipe sem acesso ao que tem; uma faixa avisa quantos problemas a validação estrita achou e leva a "Verificar integridade". A contagem é feita ao carregar ou substituir o workspace, não a cada edição. Só falhas de leitura (formato, versão) levam à recuperação.

### Limitações (não alegamos detectar todo desaparecimento de dados)

1. **O `localStorage` não avisa quando algo some.** O app só sabe que existiu um workspace pelos rastros que ele mesmo deixa em outras chaves. Se o navegador (ou a pessoa, em "limpar dados do site") apagar **todas** as chaves do Alpha7, não resta evidência e o caso é **idêntico a uma primeira utilização**: a tela de escolha aparece, sem aviso de perda. Isso inclui trocar de navegador, de perfil ou de endereço (outra origem), que são, de fato, espaços novos.
2. **A marca de uso é só uma pista.** Ela foi criada na 0.3.1; navegadores com dados antigos a ganham na primeira abertura depois da atualização. Quem teve os dados apagados **antes** de abrir a 0.3.1 não tem marca nem rastros e cai em "primeira utilização". Qualquer das outras chaves (cópia de segurança, cópia ilegível, registro de backup) também serve de rastro, mas não existem em todo navegador.
3. **Alteração manual** (DevTools, extensões) pode remover só a chave principal ou só as marcas; o comportamento segue as regras da tabela acima, sem garantia além disso.
4. **Perda com o app aberto.** Se outra aba ou uma limpeza apagar os dados enquanto esta aba está aberta, ela continua mostrando o que já carregou, as gravações novas são recusadas com mensagem e **não há exportação do que está só na memória da aba**. Recarregar a página abre a recuperação. A causa mais provável de perda real continua sendo não ter backup.
5. **Sem armazenamento do navegador** (modo restrito), não há memória de uso anterior: abre sempre na escolha.
6. **A cópia automática é de uma só vaga** e some junto com o resto se o site for limpo.
7. **A recuperação é manual.** Os "dados brutos" baixados não são backups restauráveis pelo aplicativo; servem para recuperação à mão.

## 8. Restaurar demonstração (protegido)

Nunca substitui em silêncio. O painel descreve o impacto, mostra "Hoje o workspace tem…", recomenda e oferece "Exportar backup agora", exige a caixa "Entendi…" quando há dados da equipe, e só então libera "Confirmar: substituir tudo pela demonstração". Cancelar não altera nada.

## 9. Lembrete, integridade e persistência

- **Lembrete**: com dados reais (não só demonstração), aparece uma faixa "Faça um backup dos dados da equipe" quando **nunca** houve backup, ou quando os dados **mudaram** desde o último e já passaram 7 dias. A mudança é detectada por uma impressão digital (SHA-256) do workspace, comparada à do último backup.
- **Verificar integridade**: roda a validação estrita sobre o que está salvo e lista os problemas.
- **Persistência**: o app pede `navigator.storage.persist()` e informa o resultado. Mesmo concedida, isso reduz mas **não elimina** o risco de perda.

## 10. Backend Supabase (0.4.0) e migração dos dados locais

**Estado:** o projeto `alpha7` tem esquema, RLS por equipe e testes de segurança, e o aplicativo já sabe usá-lo (login, equipe, papéis, `SupabaseGateway`), **mas só com `VITE_DATA_BACKEND=supabase`**. O padrão continua `local`. **Nenhum dado real foi para a nuvem** e não existe cópia automática do local para o remoto. Detalhes, papéis e limites: `supabase/README.md`.

**O que muda para a segurança dos dados quando o backend é `supabase`:**

- **Quem protege os dados é a RLS do banco.** A URL e a chave publishable ficam no navegador por desenho; sem login e sem pertencer à equipe, nada é lido. A chave `service_role`/`sb_secret_` é recusada pelo app. O frontend esconde botões por papel, mas o banco recusa de qualquer forma (testado no banco real, com recusa traduzida em mensagem e nunca em sucesso falso).
- **Dados locais e remotos nunca se misturam e nunca se trocam sozinhos:** configuração inválida é erro explícito; remoto vazio abre vazio (nunca demonstração); falha de leitura (sem conexão, sessão vencida, dado inesperado) é erro com "Tentar de novo", sem criar nada. Sair ou trocar de equipe limpa os dados da tela.
- **O que se perde em relação ao local (riscos novos):** não há cópia de segurança automática nem "desfazer" na nuvem; **excluir treino é definitivo** (cascata no banco; só o coach; a interface confirma com as contagens); restaurar demonstração, apagar tudo e importar backup **não existem** com dados na nuvem (seriam destrutivos para todos os integrantes). O backup em arquivo continua disponível e **recomendado** (exportar lê o que está no servidor).
- **Sem transação entre tabelas** ao salvar escalações e treinos (ver `supabase/README.md`, limite 1): falha no meio pode deixar o salvamento incompleto; o gateway tenta restaurar a escalação e avisa; repetir conclui o treino.
- **Duas pessoas editando:** a última gravação vence; não há aviso de conflito nem tempo real.
- **Contas e senhas** são do Supabase Auth (sem cadastro público no app). Recuperação de senha depende de ajustes no painel. A sessão fica no navegador (como todo login web): em computador compartilhado, use "Sair".

O que vale para a futura migração dos dados locais:

Preservar, como contrato:

- Os **`id` de todas as entidades** e as relações entre elas (avaliação → atleta; escalação → atletas; exercício → treino; registro → treino + exercício do mesmo treino + atleta participante). Se o banco usar UUID, mapear 1:1 e manter a tabela de equivalência.
- O **histórico de avaliações** (somente acrescentado; Overall é calculado, nunca gravado).
- Os registros de treino **com `voidedAt`** (anulação em vez de exclusão) e a **`attemptKey`** única (idempotência).
- A camisa única, a taxonomia de fundamentos/resultados (`src/domain/fundamentals.ts`) e os pesos do Overall.
- O **arquivo de backup** é a fonte recomendada da migração (já validado, com vínculos e checksum). Fazer a importação para o banco **numa transação**, com prévia, como na importação local.
- O contrato `DataGateway` já foi reinterpretado para o remoto (0.4.0): `replaceWorkspace`/`restoreSnapshot` recusam, `snapshotInfo`/`exportRaw`/`usage` devolvem vazio, `subscribe` é nulo. A importação transacional (tudo ou nada, com prévia) é a próxima etapa e precisará de função própria no banco.
- Só a chave **publishable/anon** vai ao frontend (e o app recusa a secreta).

## 11. Limites e riscos que continuam

1. **Backup depende da pessoa**: sem exportar e guardar o arquivo fora do navegador, não há proteção contra perda do aparelho ou limpeza do navegador.
2. **Armazenamento local pode ser apagado** pelo navegador (pouco espaço, modo privado, "limpar dados do site"). Quando sobra algum rastro, o app abre a recuperação; quando **tudo** some, ele não distingue isso de primeira utilização (seção 7, limitações).
3. **Arquivo sem criptografia** e checksum que não protege contra adulteração intencional.
4. **Uma só cópia automática**; duas substituições seguidas descartam a anterior.
5. **Duas abas gravando ao mesmo tempo**: a última vence.
6. **Dois navegadores/aparelhos** têm workspaces independentes; não há mesclagem. Restaurar um backup **substitui**, não mescla.
7. **Leitura normal é permissiva** (item 6 da seção 2): vínculos quebrados só aparecem em "Verificar integridade" ou ao exportar.
8. **Limite de ~5 milhões de caracteres** do `localStorage`. Cada tentativa registrada ocupa cerca de 210 caracteres com ids curtos (medido) e provavelmente 350 a 400 com ids em formato UUID (estimativa, não medida), ou seja, a ordem de **10 mil tentativas** no total. Com registro intenso (várias dezenas de tentativas por atleta por treino) isso pode ser atingido em **poucos meses**, e a cópia automática, que guarda uma segunda cópia inteira, reduz esse espaço pela metade. Por isso a tela de Configurações mostra o uso e avisa a partir de 70%. Esse é um dos motivos para o backend definitivo.
9. **Sem controle de acesso**: quem abre o navegador do aparelho vê os dados.
10. **Dados de demonstração** continuam marcados e contados à parte; o backup os preserva com a marca `demo`.

## 12. Testes que cobrem estas etapas

- `src/data/backup.test.ts`: ida e volta do workspace completo; histórico de avaliações, vínculos e registros desfeitos preservados; pesos personalizados; ausência de segredos; nome do arquivo; recusa de exportar dado inconsistente; arquivos inválidos (JSON ruim, outro formato, versão futura, checksum errado, tipos/faixas/vínculos inválidos, hash correto com conteúdo forjado, duplicidades); campos desconhecidos descartados; poluição de protótipo.
- `src/data/gateway.test.ts`: cópia automática byte a byte, desfazer e ir-e-voltar, falha de cota aborta sem alterar, falha de gravação mantém o anterior, cópia ilegível, memória sem armazenamento, evento `storage`, uso do armazenamento, camisa única, cópia ao excluir treino; inicialização sem criar dados (primeira utilização, ausente com cada tipo de rastro, ilegível, gravação recusada quando o workspace sumiu, marca de uso, cópias brutas de recuperação).
- `src/data/sha256.test.ts`: vetores oficiais e comparação com o `crypto` do Node.
- `src/features/settings/backup.test.tsx`: exportar, prévia, confirmar, cancelar, arquivo inválido sem alteração, falha durante a restauração sem perda, confirmação reforçada da demonstração e de apagar tudo, desfazer, verificar integridade, uso do armazenamento, lembrete, atualização por outra aba.
- `src/features/startup/startup.test.tsx`: primeiro acesso sem dados prévios (nada gravado antes da escolha; vazio; demonstração; importar backup; falha de gravação), carregamento normal de workspace existente (sem regravar; marca de uso; inconsistência não bloqueia; demonstração misturada anunciada), perda da chave principal com cada rastro, tentar novamente (ainda ausente e com os dados de volta), cópia automática (baixar, restaurar, ilegível), importação na recuperação (sucesso, arquivo adulterado, falha de gravação, cancelar), workspace novo só após confirmação (cancelar, vazio, demonstração), dados ilegíveis (texto preservado, baixar, cópia de segurança, cota cheia) e a garantia de que seis cenários de dado ausente ou inválido nunca viram demonstração em silêncio.
- `e2e/startup.spec.ts` (Playwright, navegador real, localStorage de verdade): escolha de primeira utilização sem gravar nada, vazio e demonstração persistindo ao recarregar, chave removida abre a recuperação, importar backup, arquivo adulterado, tentar novamente, workspace novo com confirmação, dado ilegível (baixar, cancelar, confirmar), axe e ausência de rolagem horizontal a 1280 px e 360 px. Os demais testes de navegador passam pela escolha de verdade por meio de `e2e/fixtures.ts`.
- `src/data/supabase/*.test.ts`, `src/auth/*.test.*`, `src/app/remote.test.tsx` (0.4.0): login, sessão, equipe, papéis, gateway remoto, erros e não mistura local/remoto, contra um **cliente Supabase simulado** (não provam a RLS real).
- `supabase/tests/rls.test.sql` e `gateway_shapes.test.sql` (0.4.0): **no banco real**, em transação que termina sempre em exceção `TESTES_OK` (nada persiste): RLS, privilégios, papéis, integridade, append-only e as formas de SQL do gateway.
- `e2e/auth.spec.ts` (Playwright, 0.4.0): login em navegador real com o backend Supabase apontando para endereço inexistente (acessibilidade, layout, falha de rede real).
- `e2e/backup.spec.ts` (Playwright, navegador real): download de verdade, apagar e restaurar, arquivo adulterado e lixo recusados, cancelar, desfazer, demonstração mantendo pesos, lembrete, axe (acessibilidade) e ausência de rolagem horizontal em 1280 px e 360 px.

## 13. Partidas e gerador de artes (0.5.0)

- **Local:** excluir uma partida guarda antes a cópia de segurança (a mesma da exclusão de treino) e mostra as contagens do que será apagado; desfazer ponto **anula**, não apaga; encerrar pede confirmação (avisa de set em andamento e de partida não decidida pelo formato); reabrir é da comissão técnica (no modo local, de quem usa o navegador).
- **Nuvem:** a escrita de sets, pontos e ações é impossível pelas tabelas e passa por funções transacionais com checagem de papel por dentro; duas pessoas registrando ao mesmo tempo não duplicam (idempotência) nem se atropelam (conflito `40001`: nada é gravado, a tela recarrega e avisa). Não existe cópia de segurança remota: a proteção é anular em vez de apagar, e só a comissão técnica exclui/reabre.
- **Backup:** coleções de partida entram aditivamente (ver `DATA_MODEL.md`); um backup anterior à 0.5.0 continua restaurável e abre com listas vazias.
- **Gerador de artes:** a restrição à comissão técnica (`arts:generate`) é da **interface e da rota** (item de menu oculto e rota barrada com explicação). Não há Storage nem escrita no banco: a arte é gerada no navegador de quem a pede, a partir de dados que essa pessoa já pode ler. **Não é uma barreira de segurança de dados**: um analista/leitor que montasse o mesmo desenho por conta própria teria os mesmos dados (que o banco já lhe entrega para leitura).
