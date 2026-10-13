# Alpha7 Volleyball Performance

Gestão de elenco, escalações e análise de desempenho para a equipe de voleibol Alpha7.

**Versão 0.3.** Funciona: elenco (cartas, busca, filtros, cadastro, edição, perfil), avaliações com histórico e Overall por posição, pesos configuráveis, escalações (titulares, líbero, reservas, ordem de saque, prévia de rodízio), **treinos** (criar/editar/excluir, participantes, exercícios, registro rápido de tentativas por fundamento com desfazer, resumo pós-treino com estatísticas) e dashboard. Em desenvolvimento: partidas, estatísticas consolidadas, gerador de artes e backend. Os dados ficam só neste navegador (sem sincronização com a nuvem) e a base inicial é uma **demonstração fictícia**, sempre identificada na interface.

**Antes de usar com dados reais:** os dados existem apenas neste navegador; limpar os dados do site apaga tudo. Em **Configurações → Backup** exporte um arquivo `alpha7-backup-….json` e guarde-o fora do navegador (o app lembra a cada 7 dias com dados alterados). A importação valida o arquivo, mostra uma prévia e só então substitui o workspace, guardando uma cópia automática para desfazer. Riscos, formato e limites: [`docs/DATA_SAFETY.md`](docs/DATA_SAFETY.md). Os critérios de registro e o limite de amostra dos treinos são decisões iniciais a validar com a comissão técnica (`docs/METRICS.md`).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unidade e telas
npm run test:e2e   # navegador real (precisa do Google Chrome instalado)
npm run build
```

Documentação em [`docs/`](docs/) e guia para desenvolvimento em [`CLAUDE.md`](CLAUDE.md).
