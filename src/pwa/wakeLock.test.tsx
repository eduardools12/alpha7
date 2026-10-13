import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './hooks';

type Listener = () => void;

function fakeSentinel() {
  const listeners: Listener[] = [];
  return {
    release: vi.fn(() => {
      listeners.forEach((listener) => listener());
      return Promise.resolve();
    }),
    addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
  };
}

function installWakeLock(request: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn(request) }, configurable: true });
  return navigator.wakeLock.request as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('pede a trava de tela ao abrir e solta ao sair', async () => {
    const sentinel = fakeSentinel();
    const request = installWakeLock(() => Promise.resolve(sentinel));
    const { unmount } = renderHook(() => useWakeLock());
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    unmount();
    await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
  });

  it('pede de novo quando o app volta para a frente depois de o sistema soltar a trava', async () => {
    const first = fakeSentinel();
    const second = fakeSentinel();
    const request = installWakeLock(() => Promise.resolve(request.mock.calls.length === 1 ? first : second));
    renderHook(() => useWakeLock());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await first.release(); // o sistema solta ao esconder a página
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('sem suporte do navegador não faz nada nem quebra', () => {
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
  });

  it('se o sistema negar (economia de energia), segue sem a trava e sem erro', async () => {
    const request = installWakeLock(() => Promise.reject(new Error('negado')));
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it('desligado, nem pede', async () => {
    const request = installWakeLock(() => Promise.resolve(fakeSentinel()));
    renderHook(() => useWakeLock(false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(request).not.toHaveBeenCalled();
  });
});
