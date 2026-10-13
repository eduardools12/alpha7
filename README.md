# Alpha7 Volleyball Performance

Gestão de elenco, escalações e análise de desempenho para a equipe de voleibol Alpha7.

**Versão 0.1.** Funciona: elenco (cartas, busca, filtros, cadastro, edição, perfil), avaliações com histórico e Overall por posição, pesos configuráveis, escalações (titulares, líbero, reservas, ordem de saque, prévia de rodízio) e dashboard. Em desenvolvimento: treinos, partidas, estatísticas, gerador de artes e backend. Os dados atuais ficam só no navegador e vêm de uma **demonstração fictícia**, sempre identificada na interface.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unidade e telas
npm run test:e2e   # navegador real (precisa do Google Chrome instalado)
npm run build
```

Documentação em [`docs/`](docs/) e guia para desenvolvimento em [`CLAUDE.md`](CLAUDE.md).
