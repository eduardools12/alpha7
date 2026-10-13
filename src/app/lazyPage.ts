import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_KEY = 'alpha7.chunkReload';
/** Janela em que uma segunda falha NÃO recarrega de novo (evita laço de recarregamentos com a rede fora). */
const RELOAD_WINDOW_MS = 30_000;

/**
 * Se um pedaço da tela não carrega, quase sempre é porque saiu uma versão nova e o endereço antigo deixou de existir.
 * Recarregar uma vez busca a versão nova; se falhar de novo logo em seguida (sem rede), o erro sobe em vez de recarregar sempre.
 */
export function reloadOnceForNewVersion(
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage,
  now: number = Date.now(),
): boolean {
  try {
    const last = Number(storage?.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    storage?.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

/** Tela carregada sob demanda (um arquivo próprio no build). Só o código da tela é baixado quando alguém a abre. */
export function lazyPage<M extends Record<string, ComponentType>, K extends keyof M>(load: () => Promise<M>, name: K): LazyExoticComponent<M[K]> {
  return lazy(() =>
    load()
      .then((module) => ({ default: module[name] }))
      .catch((error: unknown) => {
        reloadOnceForNewVersion();
        throw error;
      }),
  );
}
