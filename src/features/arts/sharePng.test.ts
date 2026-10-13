import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSharePng, pngFile, sharePng } from './sharePng';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  vi.restoreAllMocks();
});

const stubShare = (share: (data: ShareData) => Promise<void>, canShare: (data?: ShareData) => boolean = () => true) => {
  Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: vi.fn(canShare), configurable: true });
  return navigator.share as unknown as ReturnType<typeof vi.fn>;
};

describe('compartilhar a arte', () => {
  it('cria o arquivo PNG com o nome pedido', () => {
    const file = pngFile(new Blob(['x']), 'arte.png');
    expect(file).toMatchObject({ name: 'arte.png', type: 'image/png' });
  });

  it('só oferece compartilhar onde o navegador aceita arquivos', () => {
    expect(canSharePng()).toBe(false); // computador: sem navigator.share
    stubShare(() => Promise.resolve(), () => false); // existe, mas não aceita arquivos
    expect(canSharePng()).toBe(false);
    stubShare(() => Promise.resolve(), () => true);
    expect(canSharePng()).toBe(true);
  });

  it('canShare lançando erro conta como sem suporte', () => {
    stubShare(() => Promise.resolve(), () => {
      throw new Error('boom');
    });
    expect(canSharePng()).toBe(false);
  });

  it('compartilha o arquivo e o título', async () => {
    const share = stubShare(() => Promise.resolve());
    expect(await sharePng(new Blob(['x']), 'arte.png', 'Alpha7 x Rivais')).toBe('shared');
    const data = share.mock.calls[0]?.[0] as ShareData;
    expect(data.title).toBe('Alpha7 x Rivais');
    expect(data.files?.[0]).toMatchObject({ name: 'arte.png', type: 'image/png' });
  });

  it('fechar o menu sem escolher não é erro', async () => {
    stubShare(() => Promise.reject(new DOMException('cancelado', 'AbortError')));
    expect(await sharePng(new Blob(['x']), 'arte.png', 't')).toBe('cancelled');
  });

  it('outra falha sobe para a tela explicar', async () => {
    stubShare(() => Promise.reject(new DOMException('sem permissão', 'NotAllowedError')));
    await expect(sharePng(new Blob(['x']), 'arte.png', 't')).rejects.toThrow('sem permissão');
  });
});
