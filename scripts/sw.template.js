/*
 * Service worker do Alpha7 (modelo). O build (scripts/serviceWorkerPlugin.ts) troca os dois marcadores de baixo (versão
 * e lista de arquivos) e grava o resultado em dist/sw.js. Os marcadores só podem aparecer UMA vez, no código. Objetivo: o aplicativo ABRIR sem internet.
 *
 * Regras:
 *  - Só intercepta GET da própria origem. Supabase (dados, login, fotos assinadas) é de outra origem: passa direto,
 *    nunca é guardado nem servido do cache. Os dados do app NÃO passam por aqui.
 *  - Navegação: rede primeiro (limite de NAV_TIMEOUT_MS), com a casca do app guardada como reserva.
 *  - Arquivos do build e da marca: do cache primeiro (os de /assets/ têm hash no nome, nunca mudam).
 *  - Uma versão nova NÃO assume sozinha: espera a pessoa tocar em "Atualizar" (mensagem SKIP_WAITING), para nunca
 *    recarregar a tela no meio de uma partida ou de um registro.
 */
const VERSION = '__VERSION__';
const CACHE_PREFIX = 'alpha7-shell-';
const CACHE = CACHE_PREFIX + VERSION;
const PRECACHE = __PRECACHE__;
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }
  event.respondWith(cacheFirst(request));
});

/** Só vale como casca do app uma resposta que de fato é o index.html (e não, por exemplo, a página de um Wi-Fi com login). */
async function looksLikeShell(response) {
  if (!response.ok) return false;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return false;
  const html = await response.clone().text();
  return html.includes('id="root"');
}

async function handleNavigation(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then(async (response) => {
    if (await looksLikeShell(response)) await cache.put('/', response.clone());
    return response;
  });
  // A resposta da rede segue atualizando a casca mesmo quando a reserva já foi usada.
  event.waitUntil(network.catch(() => undefined));
  try {
    return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, NAV_TIMEOUT_MS))]);
  } catch {
    const shell = await cache.match('/');
    if (shell) return shell;
    return network;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  // ignoreVary: o servidor pode responder `Vary: Origin`; os pedidos de módulos (import dinâmico) levam o cabeçalho Origin e
  // não casariam com o que foi guardado na instalação. Estes arquivos não variam por quem pede.
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}
