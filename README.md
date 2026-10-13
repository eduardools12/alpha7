# Alpha7 Volleyball Performance

Gestão de elenco, escalações e análise de desempenho para a equipe de voleibol Alpha7.

**Versão 0.5.0.** Funciona: elenco (cartas, busca, filtros, cadastro, edição, perfil), avaliações com histórico e Overall por posição, pesos configuráveis, escalações (titulares, líbero, reservas, ordem de saque, prévia de rodízio), **treinos** (criar/editar/excluir, participantes, exercícios, registro rápido de tentativas por fundamento com desfazer, resumo pós-treino com estatísticas) e dashboard. Também: **partidas** (placar por set, saque e rotação, pontos e ações técnicas), **estatísticas consolidadas** de treinos e partidas e **gerador de artes** da escalação (só comissão técnica). Os dados ficam, por padrão, só neste navegador (sem sincronização com a nuvem; o backend Supabase é opcional) e a base inicial é uma **demonstração fictícia**, sempre identificada na interface.

**Antes de usar com dados reais:** os dados existem apenas neste navegador; limpar os dados do site apaga tudo. Em **Configurações → Backup** exporte um arquivo `alpha7-backup-….json` e guarde-o fora do navegador (o app lembra a cada 7 dias com dados alterados). A importação valida o arquivo, mostra uma prévia e só então substitui o workspace, guardando uma cópia automática para desfazer. Riscos, formato e limites: [`docs/DATA_SAFETY.md`](docs/DATA_SAFETY.md). Os critérios de registro e o limite de amostra dos treinos são decisões iniciais a validar com a comissão técnica (`docs/METRICS.md`).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unidade e telas
npm run test:e2e   # navegador real (precisa do Google Chrome instalado)
npm run build
```

**Backend de dados:** por padrão os dados ficam neste navegador. Com `VITE_DATA_BACKEND=supabase` (ver `.env.example` e [`supabase/README.md`](supabase/README.md)) o app exige login por e-mail e senha e usa os dados da equipe na nuvem, com papéis de acesso (coach, analyst, viewer); essa opção está pronta mas **desligada**, e nenhum dado local é copiado para a nuvem.

## Publicação (Vercel)

O app é um site estático (Vite) publicado na Vercel, projeto `alpha7` da conta `eduardools12's projects`.

- **Endereço de produção:** https://alpha7-liart.vercel.app (aberto; quem protege os dados é o login do app e a RLS do banco). Os endereços únicos de cada publicação ficam protegidos pela Vercel.
- **Configuração:** `vercel.json` (rotas do app de página única, cabeçalhos de segurança, cache dos arquivos com hash) e `.vercelignore` (não envia `design/`, `docs/`, `e2e/`, `supabase/`). A pasta `.vercel/` (vínculo local) é ignorada pelo Git.
- **Variáveis de produção** (cadastradas no projeto, só valores públicos): `VITE_DATA_BACKEND=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Elas entram no código durante o build, então **mudar uma variável exige publicar de novo**.
- **Publicar uma nova versão** (precisa estar logado: `npx vercel@latest login`):

```bash
npx vercel@latest deploy --prod --yes --scope eduardools12s-projects
```

  O build roda na Vercel (`npm run build`, que inclui a checagem de tipos). Não há publicação automática a cada commit (o repositório não está conectado ao GitHub).
- **Depois de publicar um endereço novo**, ajuste no painel do Supabase (Authentication → URL Configuration) a *Site URL* e as *Redirect URLs*; ver `supabase/README.md`.

Documentação em [`docs/`](docs/) e guia para desenvolvimento em [`CLAUDE.md`](CLAUDE.md).
