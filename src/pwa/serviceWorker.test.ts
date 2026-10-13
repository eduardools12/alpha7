import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, isUpdateReady, registerServiceWorker, resetServiceWorkerState } from './serviceWorker';

type Listener = () => void;

/** Service worker de mentira: guarda os ouvintes e deixa o teste disparar eventos. */
function fakeWorker(state: ServiceWorkerState = 'installed') {
  const listeners = new Map<string, Listener[]>();
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    emit: (type: string) => (listeners.get(type) ?? []).forEach((listener) => listener()),
  };
}

function setup({ controller = true, waiting = false } = {}) {
  const worker = fakeWorker();
  const registrationListeners = new Map<string, Listener[]>();
  const registration = {
    waiting: waiting ? worker : null,
    installing: null as ReturnType<typeof fakeWorker> | null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: (type: string, listener: Listener) => registrationListeners.set(type, [...(registrationListeners.get(type) ?? []), listener]),
  };
  const containerListeners = new Map<string, Listener[]>();
  const container = {
    controller: controller ? {} : null,
    register: vi.fn(() => Promise.resolve(registration)),
    addEventListener: (type: string, listener: Listener) => containerListeners.set(type, [...(containerListeners.get(type) ?? []), listener]),
  };
  const visibility = {
    visibilityState: 'visible' as DocumentVisibilityState,
    listeners: [] as Listener[],
    addEventListener(_type: string, listener: Listener) {
      this.listeners.push(listener);
    },
  };
  const reload = vi.fn();
  // Os fakes só implementam o que o registro usa; o resto do contrato do navegador não importa aqui.
  registerServiceWorker({ container: container as unknown as ServiceWorkerContainer, reload, visibility });
  return {
    worker,
    registration,
    container,
    visibility,
    reload,
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
    emitContainer: (type: string) => (containerListeners.get(type) ?? []).forEach((listener) => listener()),
    emitRegistration: (type: string) => (registrationListeners.get(type) ?? []).forEach((listener) => listener()),
  };
}

beforeEach(() => resetServiceWorkerState());

describe('registro do service worker', () => {
  it('registra /sw.js', async () => {
    const t = setup();
    await t.settle();
    expect(t.container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('primeira instalação (ainda sem controlador) não é uma atualização', async () => {
    const t = setup({ controller: false, waiting: true });
    await t.settle();
    expect(isUpdateReady()).toBe(false);
  });

  it('versão nova esperando, com o app já controlado, vira aviso', async () => {
    const t = setup({ waiting: true });
    await t.settle();
    expect(isUpdateReady()).toBe(true);
  });

  it('versão que termina de instalar com o app aberto também vira aviso', async () => {
    const t = setup();
    await t.settle();
    expect(isUpdateReady()).toBe(false);
    t.registration.installing = t.worker;
    t.registration.waiting = t.worker;
    t.emitRegistration('updatefound');
    t.worker.emit('statechange');
    expect(isUpdateReady()).toBe(true);
  });

  it('atualizar manda SKIP_WAITING e só então recarrega, quando a versão nova assume', async () => {
    const t = setup({ waiting: true });
    await t.settle();
    t.emitContainer('controllerchange'); // assumir sem ter pedido NÃO recarrega
    expect(t.reload).not.toHaveBeenCalled();
    applyUpdate();
    expect(t.worker.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    expect(t.reload).not.toHaveBeenCalled(); // ainda não assumiu
    t.emitContainer('controllerchange');
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it('sem versão esperando, atualizar não faz nada', () => {
    expect(() => applyUpdate()).not.toThrow();
  });

  it('procura versão nova quando o app volta para a frente, não quando vai para trás', async () => {
    const t = setup();
    await t.settle();
    t.visibility.visibilityState = 'hidden';
    t.visibility.listeners.forEach((l) => l());
    expect(t.registration.update).not.toHaveBeenCalled();
    t.visibility.visibilityState = 'visible';
    t.visibility.listeners.forEach((l) => l());
    expect(t.registration.update).toHaveBeenCalledTimes(1);
  });

  it('falha no registro é silenciosa: o app segue funcionando sem abrir offline', async () => {
    const container = { controller: null, register: vi.fn(() => Promise.reject(new Error('bloqueado'))), addEventListener: vi.fn() };
    expect(() => registerServiceWorker({ container: container as unknown as ServiceWorkerContainer, reload: vi.fn(), visibility: document })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isUpdateReady()).toBe(false);
  });

  it('sem suporte do navegador não faz nada', () => {
    expect(() => registerServiceWorker({ container: undefined, reload: vi.fn(), visibility: document })).not.toThrow();
  });
});
