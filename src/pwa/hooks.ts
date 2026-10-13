import { useEffect, useRef, useSyncExternalStore } from 'react';
import { installState, subscribeInstall, type InstallState } from './installPrompt';
import { isUpdateReady, subscribeUpdate } from './serviceWorker';

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** false só quando o aparelho SABE que está sem rede (modo avião, sem Wi-Fi). Rede ruim ainda conta como conectado. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribeInstall, installState, () => 'unavailable');
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribeUpdate, isUpdateReady, () => false);
}

/**
 * Mantém a tela ligada enquanto o componente está montado (partida ao vivo, registro de treino: ninguém quer a
 * tela apagando com o celular na mão do técnico). Sem suporte ou sem permissão, não faz nada e não atrapalha.
 * O sistema libera a trava ao esconder a página; ela é pedida de novo quando o app volta para a frente.
 */
export function useWakeLock(enabled = true): void {
  const sentinel = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || sentinel.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel.current = lock;
        lock.addEventListener('release', () => {
          if (sentinel.current === lock) sentinel.current = null;
        });
      } catch {
        /* bateria fraca, economia de energia ou permissão negada: segue sem a trava */
      }
    };

    void acquire();
    const onVisibility = () => void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = sentinel.current;
      sentinel.current = null;
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}
