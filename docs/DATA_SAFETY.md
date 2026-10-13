# Segurança dos dados

Auditoria da persistência do Alpha7 antes do uso com dados reais da equipe, e as proteções implementadas na v0.3. Escrito a partir do código (`src/data/`, `src/features/settings/`) e dos testes; onde algo é limite ou risco que **continua existindo**, está dito.

> **Resumo.** Os dados vivem só no `localStorage` deste navegador. Não há servidor, nuvem nem sincronização. Quem apaga os dados do navegador, troca de perfil/aparelho ou perde o disco perde tudo, **a não ser que tenha um backup em arquivo**. A v0.3 acrescenta backup e restauração validados, cópia de segurança automática antes de qualquer substituição, confirmação com descrição do impacto e verificação de integridade. A migração para o Supabase **não** foi iniciada.

## 1. Como os dados são guardados

| Item | Valor |
|---|---|
| Onde | `localStorage` do navegador, por **origem** (endereço + porta). Outro endereço, navegador, perfil ou aparelho enxerga um workspace diferente (vazio ou de demonstração) |
| Chave principal | `alpha7.workspace.v1` → JSON `{ version: 1, players, evaluations, lineups, settings, activity, trainings, exercises, trainingEvents }` |
| Outras chaves | `…v1.snapshot` (cópia da última substituição), `…v1.corrupt` (cópia de dado ilegível), `alpha7.lastBackup.v1` (metadado do último backup). Ver [DATA_MODEL.md](DATA_MODEL.md) |
| Gravação | Cada alteração regrava o JSON inteiro numa única chamada `setItem` (tudo ou nada) |
| Limite | Cerca de 5 milhões de caracteres por site (varia por navegador). A tela Configurações mostra o uso e avisa a partir de 70% |
| Sem armazenamento | Em modo restrito/privado o app funciona **só em memória** e avisa na faixa superior; fechar a aba perde tudo |
| Segredos | Nenhum. O app não usa chaves, tokens nem senhas; o backup não contém nenhum (há teste) |

## 2. Achados da auditoria (estado anterior à v0.3) e o que foi feito

Gravidade: **A** pode causar perda de dados reais; **M** pode causar perda ou dado incorreto em situações específicas; **B** conforto/clareza.

| # | Achado | Grav. | Situação |
|---|---|---|---|
| 1 | **Não havia backup nem como tirar os dados do navegador.** Qualquer limpeza de dados do site, perfil novo ou troca de computador apagava histórico de avaliações e treinos | A | **Resolvido** parcialmente: exportação em arquivo (seção 4). Continua dependendo de a pessoa exportar e guardar o arquivo; há lembrete (seção 8) |
| 2 | **"Restaurar demonstração" e "Apagar todos os dados" substituíam o workspace inteiro**, inclusive o que a equipe cadastrou, com um texto de confirmação genérico, sem recomendar backup e sem como voltar | A | **Resolvido**: painel com o impacto descrito, recomendação e botão de backup, caixa "Entendi…" quando há dados reais, e **cópia de segurança automática** com "Desfazer" (seção 6) |
| 3 | **Excluir um treino apaga em cascata exercícios e todos os registros** (válidos e desfeitos). A tela informava as contagens, mas não havia volta | M | **Mitigado**: o gateway guarda a cópia de segurança antes de excluir (e aborta se não conseguir). "Desfazer última substituição" recupera. Só a última fica guardada |
| 4 | **Se a chave principal sumisse** (navegador limpou o armazenamento, dado evicto), a próxima abertura **semeava a demonstração em silêncio**, parecendo um app novo | A | **Parcialmente mitigado**: pedimos armazenamento persistente (`navigator.storage.persist()`), mostramos se foi concedido e exibimos a faixa "Dados de demonstração" (com os números) sempre que o que está na tela é demonstração. **Risco residual**: o app não consegue distinguir "primeira vez" de "dados apagados". O lembrete de backup e o arquivo são a defesa real |
| 5 | **Dado ilegível**: o app já recusava abrir e guardava cópia em `…corrupt`, mas a única saída era recomeçar | M | **Melhorado**: a tela de recuperação explica que nada foi apagado, permite **baixar o texto ilegível** e só então recomeçar (em dois passos). O texto antigo também vai para a cópia de segurança |
| 6 | **Leitura frágil**: ao abrir, o app só conferia o formato superficial (`looksLike…`). Vínculos quebrados (avaliação de atleta inexistente, evento de outro treino), camisas repetidas ou chaves duplicadas **passavam** | M | **Resolvido para o backup e para o diagnóstico**: a mesma validação estrita (seção 5) roda na exportação, na importação e em "Verificar integridade dos dados". **Não** bloqueia a abertura normal (evita travar quem já tem dados), mas a exportação **recusa** gerar backup de dado inconsistente e oferece baixar a cópia bruta |
| 7 | **Pesos do Overall inválidos eram trocados em silêncio pelos padrões** ao abrir (`readWeights`) e gravados por cima na próxima alteração | M | **Aberto (baixo risco)**: só ocorre se o JSON salvo for editado à mão ou corrompido. O backup valida os pesos e **recusa** pesos inválidos em vez de trocá-los. Não alteramos o comportamento de abertura para não mudar funcionalidade sem necessidade |
| 8 | **Duas abas abertas**: cada uma lê o workspace uma vez e regrava o conjunto inteiro; a última a gravar vence e pode apagar o que a outra fez | M | **Mitigado**: o app escuta o evento `storage` e recarrega em silêncio quando outra aba grava; `savePlayer` revalida a camisa única contra o dado atual. **Risco residual**: se as duas abas gravarem quase ao mesmo tempo, a última vence (sem bloqueio entre abas). Use uma aba por vez |
| 9 | **Restaurar a demonstração zerava os pesos do Overall** personalizados | B | **Resolvido**: os pesos atuais são mantidos em "Restaurar demonstração" e em "Apagar tudo" |
| 10 | **Sem versão do app visível**, difícil dizer de que versão veio um arquivo | B | **Resolvido**: `src/version.ts` (v0.3.0, igual ao `package.json`, com teste), exibida na barra lateral e gravada no backup |
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
  "appVersion": "0.3.0",               // versão do app que exportou (informativa)
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

## 7. Restaurar demonstração (protegido)

Nunca substitui em silêncio. O painel descreve o impacto, mostra "Hoje o workspace tem…", recomenda e oferece "Exportar backup agora", exige a caixa "Entendi…" quando há dados da equipe, e só então libera "Confirmar: substituir tudo pela demonstração". Cancelar não altera nada.

## 8. Lembrete, integridade e persistência

- **Lembrete**: com dados reais (não só demonstração), aparece uma faixa "Faça um backup dos dados da equipe" quando **nunca** houve backup, ou quando os dados **mudaram** desde o último e já passaram 7 dias. A mudança é detectada por uma impressão digital (SHA-256) do workspace, comparada à do último backup.
- **Verificar integridade**: roda a validação estrita sobre o que está salvo e lista os problemas.
- **Persistência**: o app pede `navigator.storage.persist()` e informa o resultado. Mesmo concedida, isso reduz mas **não elimina** o risco de perda.

## 9. Para a futura migração ao Supabase (não iniciada)

Preservar, como contrato:

- Os **`id` de todas as entidades** e as relações entre elas (avaliação → atleta; escalação → atletas; exercício → treino; registro → treino + exercício do mesmo treino + atleta participante). Se o banco usar UUID, mapear 1:1 e manter a tabela de equivalência.
- O **histórico de avaliações** (somente acrescentado; Overall é calculado, nunca gravado).
- Os registros de treino **com `voidedAt`** (anulação em vez de exclusão) e a **`attemptKey`** única (idempotência).
- A camisa única, a taxonomia de fundamentos/resultados (`src/domain/fundamentals.ts`) e os pesos do Overall.
- O **arquivo de backup** é a fonte recomendada da migração (já validado, com vínculos e checksum). Fazer a importação para o banco **numa transação**, com prévia, como na importação local.
- O contrato `DataGateway` (`replaceWorkspace`, `snapshotInfo`, `restoreSnapshot`, `exportRaw`, `subscribe`, `usage`) deve ser reinterpretado para o novo backend: no Supabase, cópia de segurança = backup/PITR do banco, `subscribe` = Realtime, `usage` pode ficar `null`.
- Só a chave **anon/publicável** pode ir ao frontend.

## 10. Limites e riscos que continuam

1. **Backup depende da pessoa**: sem exportar e guardar o arquivo fora do navegador, não há proteção contra perda do aparelho ou limpeza do navegador.
2. **Armazenamento local pode ser apagado** pelo navegador (pouco espaço, modo privado, "limpar dados do site"). O app não distingue isso de primeiro uso.
3. **Arquivo sem criptografia** e checksum que não protege contra adulteração intencional.
4. **Uma só cópia automática**; duas substituições seguidas descartam a anterior.
5. **Duas abas gravando ao mesmo tempo**: a última vence.
6. **Dois navegadores/aparelhos** têm workspaces independentes; não há mesclagem. Restaurar um backup **substitui**, não mescla.
7. **Leitura normal é permissiva** (item 6 da seção 2): vínculos quebrados só aparecem em "Verificar integridade" ou ao exportar.
8. **Limite de ~5 milhões de caracteres** do `localStorage`. Cada tentativa registrada ocupa cerca de 210 caracteres com ids curtos (medido) e provavelmente 350 a 400 com ids em formato UUID (estimativa, não medida), ou seja, a ordem de **10 mil tentativas** no total. Com registro intenso (várias dezenas de tentativas por atleta por treino) isso pode ser atingido em **poucos meses**, e a cópia automática, que guarda uma segunda cópia inteira, reduz esse espaço pela metade. Por isso a tela de Configurações mostra o uso e avisa a partir de 70%. Esse é um dos motivos para o backend definitivo.
9. **Sem controle de acesso**: quem abre o navegador do aparelho vê os dados.
10. **Dados de demonstração** continuam marcados e contados à parte; o backup os preserva com a marca `demo`.

## 11. Testes que cobrem esta etapa

- `src/data/backup.test.ts`: ida e volta do workspace completo; histórico de avaliações, vínculos e registros desfeitos preservados; pesos personalizados; ausência de segredos; nome do arquivo; recusa de exportar dado inconsistente; arquivos inválidos (JSON ruim, outro formato, versão futura, checksum errado, tipos/faixas/vínculos inválidos, hash correto com conteúdo forjado, duplicidades); campos desconhecidos descartados; poluição de protótipo.
- `src/data/gateway.test.ts`: cópia automática byte a byte, desfazer e ir-e-voltar, falha de cota aborta sem alterar, falha de gravação mantém o anterior, cópia ilegível, memória sem armazenamento, evento `storage`, uso do armazenamento, camisa única, cópia ao excluir treino.
- `src/data/sha256.test.ts`: vetores oficiais e comparação com o `crypto` do Node.
- `src/features/settings/backup.test.tsx`: exportar, prévia, confirmar, cancelar, arquivo inválido sem alteração, falha durante a restauração sem perda, confirmação reforçada da demonstração e de apagar tudo, desfazer, verificar integridade, uso do armazenamento, lembrete, atualização por outra aba, recuperação de dado ilegível.
- `e2e/backup.spec.ts` (Playwright, navegador real): download de verdade, apagar e restaurar, arquivo adulterado e lixo recusados, cancelar, desfazer, demonstração mantendo pesos, lembrete, axe (acessibilidade) e ausência de rolagem horizontal em 1280 px e 360 px.
