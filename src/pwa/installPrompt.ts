/**
 * Instalação do aplicativo. O Chrome/Edge avisam por `beforeinstallprompt` (guardamos o evento para abrir o pedido
 * por um botão nosso); o Safari do iPhone não tem esse evento: só dá para orientar (Compartilhar > Adicionar à Tela de Início).
 */
export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event;
}

type Listener = () => void;
let deferred: InstallPromptEvent | null = null;
let installedByEvent = false;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribeInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Escuta os eventos o quanto antes (o navegador pode disparar antes de a tela de Configurações existir). */
export function initInstallPrompt(target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('beforeinstallprompt', (event) => {
    if (!isInstallPromptEvent(event)) return;
    event.preventDefault();
    deferred = event;
    notify();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    installedByEvent = true;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = 'standalone' in navigator && navigator.standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS se apresenta como Mac, mas tem tela de toque.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function installState(): InstallState {
  if (installedByEvent || isStandalone()) return 'installed';
  if (deferred) return 'available';
  if (isIosDevice()) return 'ios';
  return 'unavailable';
}

/** Abre o pedido de instalação do navegador. Só existe quando o estado é `available`. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null; // o evento só pode ser usado uma vez
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

/** Só para testes. */
export function resetInstallPromptState(): void {
  deferred = null;
  installedByEvent = false;
  listeners.clear();
}
