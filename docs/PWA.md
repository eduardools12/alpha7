# Aplicativo instalável (PWA) e uso sem internet

Desde a 0.7.0 o Alpha7 pode ser instalado no celular ou no computador (ícone na tela inicial, abre em tela cheia) e **abre sem internet**. Este documento diz o que isso garante, o que não garante e como foi verificado.

## O que existe

| Peça | Onde | O que faz |
|---|---|---|
| Manifesto | `public/manifest.webmanifest` | Nome, cores oficiais (`#270949` barra, `#17141d` fundo), ícones, atalhos para Partidas, Treinos e Elenco |
| Ícones | `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Gerados por `python scripts/make-pwa-icons.py` a partir do símbolo A7 oficial (`public/brand/a7-mark-white.png`) sobre o roxo oficial. O símbolo é só posicionado, nunca redesenhado nem distorcido; o maskable deixa o símbolo dentro da zona segura |
| Service worker | `scripts/sw.template.js` + `scripts/serviceWorkerPlugin.ts` | O build gera `dist/sw.js` com a lista exata dos arquivos e uma versão (hash do conteúdo). Sem dependência nova |
| Registro e aviso de versão | `src/pwa/serviceWorker.ts`, `UpdateNotice` em `AppLayout` | Registra só em produção; versão nova espera a pessoa tocar em "Atualizar agora" |
| Instalação | `src/pwa/installPrompt.ts`, `src/features/settings/InstallPanel.tsx` | Botão "Instalar o Alpha7" (Chrome/Edge/Android); no iPhone, orientação pelo Safari |
| Tela sempre ligada | `useWakeLock` (`src/pwa/hooks.ts`) | Partida ao vivo e registro de treino mantêm a tela acesa (Screen Wake Lock); sem suporte, não faz nada |
| Divisão por tela | `src/app/lazyPage.ts`, `App.tsx` | Dashboard e elenco abrem com o app; as demais telas são baixadas ao abrir (e já ficam guardadas pelo service worker) |

## Regras do service worker (não mudar sem repensar)

1. **Só intercepta GET da própria origem.** Supabase (dados, login, fotos assinadas) é outra origem: passa direto, nunca é guardado nem servido do cache. Os dados do app não passam pelo service worker.
2. **Navegação:** rede primeiro, com limite de 4 s; se falhar ou demorar, serve a casca (`/`) guardada. A casca só é guardada se a resposta for de fato o `index.html` (um Wi-Fi com página de login não vira "o aplicativo").
3. **Arquivos do build e da marca:** do cache primeiro. Os de `/assets/` têm hash no nome. A versão do cache muda a cada build que muda algo; caches antigos são apagados na ativação.
4. **Versão nova nunca assume sozinha.** O aviso "Há uma versão nova do Alpha7" pede a confirmação e **não aparece** na partida ao vivo nem no registro de treino (um aviso surgindo ali deslocaria os botões no meio de um toque). Só depois de tocar em Atualizar a página recarrega.
5. A instalação guarda cerca de 2,2 MB (tudo o que o build gerou, menos `.woff`, mapas e os logos/uniformes originais). Esses arquivos originais são guardados só se alguém abrir Configurações.

## O que funciona sem internet

- **Dados neste navegador (padrão):** tudo. Ver elenco, registrar treinos e partidas, criar escalações; os dados estão no aparelho.
- **Dados na nuvem (produção):** o aplicativo **abre**, mas os dados da equipe estão no servidor: sem conexão não dá para ver dados novos nem gravar. As telas de registro mostram "Sem conexão com a nuvem" e travam os botões de registro. **Não existe fila local para enviar depois**, de propósito: placar, saque e rotação são calculados no servidor (regra 11 do `CLAUDE.md`) e uma fila no aparelho poderia divergir dele ou duplicar pontos. Erros de registro agora **ficam na tela** até o próximo aviso (antes sumiam em 3,5 s).
- A detecção usa `navigator.onLine`: ele só indica "sem rede" quando o aparelho sabe que está sem rede (modo avião, sem Wi-Fi). Rede ruim (sinal fraco, Wi-Fi sem internet) conta como conectado; nesse caso o registro falha com a mensagem de erro de sempre, que agora permanece visível.

## iPhone e iPad

- Não há pedido de instalação: Safari → Compartilhar → "Adicionar à Tela de Início" (o painel Configurações → "Aplicativo no celular" mostra os passos).
- O aplicativo instalado guarda **a própria sessão e os próprios dados locais**, separados do Safari. Com dados na nuvem, entre com e-mail e senha de novo dentro do aplicativo instalado. Com dados locais, os dados do Safari **não** aparecem no aplicativo instalado (exporte e importe o backup se for migrar).
- O link de recuperação de senha abre no navegador, não no aplicativo instalado.

## Como foi verificado (e o que não foi)

- **Defeito que só o navegador real achou:** o servidor responde `Vary: Origin` e o cache não casava os pedidos de módulos das telas carregadas sob demanda, que falhavam sem internet. O service worker agora usa `ignoreVary` (há teste do modelo e o e2e acima).

- **Unidade:** geração do service worker (lista, versão estável, marcadores trocados uma única vez, JavaScript válido), manifesto e ícones (tamanhos lidos do cabeçalho do PNG), registro e aviso de versão (primeira instalação não vira "atualização", só recarrega depois de autorizado), pedido de instalação, trava de tela, avisos de conexão.
- **Navegador real (Chrome, build de produção em `vite preview`, `e2e/pwa.spec.ts`):** depois da primeira visita, recarregar e abrir direto `/partidas`, `/treinos`, `/escalacoes`, `/estatisticas` (gráficos) e `/configuracoes` com a rede desligada funciona (todas carregadas sob demanda); cadastrar uma partida sem rede funciona (modo local). O Chrome informou **nenhum erro de instalabilidade** além de estar em modo anônimo (contexto do teste), e nenhum erro no manifesto.
- **Não verificado:** instalação num celular de verdade, o ícone na tela inicial, o comportamento no iPhone, a trava de tela em aparelho real e o uso no ginásio. Peça para alguém da comissão testar antes de depender disso numa partida.

## Publicar

`vercel.json` serve `/sw.js` sem cache (`max-age=0, must-revalidate`) e o manifesto como `application/manifest+json`. Depois de publicar, quem já tem o app aberto vê o aviso de versão nova na próxima vez que o aplicativo voltar para a frente.
