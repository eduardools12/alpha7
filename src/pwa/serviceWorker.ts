/**
 * Registro do service worker e aviso de versão nova. O service worker (scripts/sw.template.js) só guarda a casca do
 * aplicativo para abrir sem internet; os dados nunca passam por ele. Uma versão nova espera a pessoa tocar em
 * "Atualizar": nada recarrega sozinho, nem no meio de uma partida.
 */
type Listener = () => void;

let waiting: ServiceWorker | null = null;
let applying = false;
const listeners = new Set<Listener>();

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker;
  listeners.forEach((listener) => listener());
}

export function subscribeUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** true quando há uma versão nova instalada, esperando autorização. */
export function isUpdateReady(): boolean {
  return waiting !== null;
}

/** Ativa a versão nova; a página recarrega assim que ela assume (evento `controllerchange`). */
export function applyUpdate(): void {
  if (!waiting) return;
  applying = true;
  waiting.postMessage('SKIP_WAITING');
}

/** Só para testes: volta ao estado inicial. */
export function resetServiceWorkerState(): void {
  waiting = null;
  applying = false;
  listeners.clear();
}

export interface RegisterOptions {
  container?: ServiceWorkerContainer | undefined;
  reload?: () => void;
  visibility?: { readonly visibilityState: DocumentVisibilityState; addEventListener(type: 'visibilitychange', listener: () => void): void };
}

/**
 * Registra o service worker. Só deve ser chamado no build de produção (no desenvolvimento um cache atrapalharia a
 * edição). Falhas são silenciosas: sem service worker o aplicativo continua funcionando, só não abre offline.
 */
export function registerServiceWorker({
  container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  reload = () => window.location.reload(),
  visibility = document,
}: RegisterOptions = {}): void {
  if (!container) return;

  container.addEventListener('controllerchange', () => {
    // Na primeira instalação o worker "assume" a página sem que isso seja uma atualização: não recarrega.
    if (applying) reload();
  });

  container
    .register('/sw.js')
    .then((registration) => {
      const check = () => {
        // Sem controller é a primeira instalação, não uma versão nova.
        if (registration.waiting && container.controller) setWaiting(registration.waiting);
      };
      check();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') check();
        });
      });
      // Procura versão nova quando o aplicativo volta para a frente (abrir o app instalado, trocar de aba).
      visibility.addEventListener('visibilitychange', () => {
        if (visibility.visibilityState === 'visible') registration.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}
