import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initInstallPrompt, installState, promptInstall, resetInstallPromptState } from './installPrompt';

beforeAll(() => initInstallPrompt());
beforeEach(() => resetInstallPromptState());
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true });
});

/** Evento `beforeinstallprompt` de mentira, com o `prompt` e o `userChoice` que o Chrome entrega. */
function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

describe('instalação do aplicativo', () => {
  it('sem sinal do navegador, a instalação fica indisponível (e a interface orienta pelo menu)', () => {
    expect(installState()).toBe('unavailable');
  });

  it('com o aviso do navegador, fica disponível e o navegador não abre o pedido sozinho', () => {
    const { event } = installEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installState()).toBe('available');
  });

  it('instalar abre o pedido do navegador uma única vez e informa a escolha', async () => {
    const { event, prompt } = installEvent('accepted');
    window.dispatchEvent(event);
    expect(await promptInstall()).toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installState()).toBe('unavailable'); // o evento só vale uma vez
    expect(await promptInstall()).toBe('unavailable');
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('recusar o pedido é informado, sem tratar como erro', async () => {
    window.dispatchEvent(installEvent('dismissed').event);
    expect(await promptInstall()).toBe('dismissed');
  });

  it('depois de instalado, mostra instalado', () => {
    window.dispatchEvent(installEvent().event);
    window.dispatchEvent(new Event('appinstalled'));
    expect(installState()).toBe('installed');
  });

  it('aberto como aplicativo (tela cheia) conta como instalado', () => {
    Object.defineProperty(window, 'matchMedia', { value: vi.fn(() => ({ matches: true })), configurable: true, writable: true });
    expect(installState()).toBe('installed');
  });

  it('no iPhone não há pedido: a interface orienta o caminho pelo Safari', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(installState()).toBe('ios');
  });

  it('ignora eventos que não são o pedido de instalação', () => {
    window.dispatchEvent(new Event('beforeinstallprompt'));
    expect(installState()).toBe('unavailable');
  });
});
