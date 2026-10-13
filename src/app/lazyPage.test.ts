import { describe, expect, it, vi } from 'vitest';
import { reloadOnceForNewVersion } from './lazyPage';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

describe('recarregar uma vez quando um pedaço da tela não carrega', () => {
  it('na primeira falha recarrega (provável versão nova publicada)', () => {
    const reload = vi.fn();
    expect(reloadOnceForNewVersion(reload, memoryStorage(), 1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('falhando de novo logo em seguida (sem rede), não entra em laço de recarregamentos', () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    reloadOnceForNewVersion(reload, storage, 1_000_000);
    expect(reloadOnceForNewVersion(reload, storage, 1_005_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('passada a janela, pode recarregar de novo (outra publicação, outro dia)', () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    reloadOnceForNewVersion(reload, storage, 1_000_000);
    expect(reloadOnceForNewVersion(reload, storage, 1_100_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('sem armazenamento da sessão, não recarrega (não dá para garantir que não vira laço)', () => {
    const reload = vi.fn();
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => undefined,
    };
    expect(reloadOnceForNewVersion(reload, broken, 1_000_000)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
