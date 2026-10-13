import { act, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { initInstallPrompt, resetInstallPromptState } from './installPrompt';
import { registerServiceWorker, resetServiceWorkerState } from './serviceWorker';

beforeAll(() => initInstallPrompt());
beforeEach(() => {
  resetInstallPromptState();
  resetServiceWorkerState();
});
afterEach(() => vi.restoreAllMocks());

function installEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

/** Deixa uma versão nova instalada e esperando, como depois de uma publicação. */
async function leaveUpdateWaiting() {
  const worker = { postMessage: vi.fn(), addEventListener: vi.fn(), state: 'installed' };
  const registration = { waiting: worker, installing: null, update: vi.fn(() => Promise.resolve()), addEventListener: vi.fn() };
  const container = { controller: {}, register: vi.fn(() => Promise.resolve(registration)), addEventListener: vi.fn() };
  // Fakes que implementam só o que o registro usa.
  await act(async () => {
    registerServiceWorker({ container: container as unknown as ServiceWorkerContainer, reload: vi.fn(), visibility: document });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return worker;
}

describe('Configurações: aplicativo no celular', () => {
  it('sem pedido de instalação do navegador, orienta pelo menu e diz o que funciona sem internet', async () => {
    renderApp({ path: '/configuracoes' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Aplicativo no celular' })).toBeInTheDocument();
    expect(screen.getByText(/Este navegador não oferece a instalação direta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar o Alpha7' })).not.toBeInTheDocument();
    expect(screen.getByText('O que funciona sem internet')).toBeInTheDocument();
    expect(screen.getByText(/tudo funciona sem internet: ver o elenco e registrar treinos e partidas/)).toBeInTheDocument();
  });

  it('com o pedido disponível, mostra o botão e abre o pedido do navegador ao clicar', async () => {
    const { user } = renderApp({ path: '/configuracoes' });
    await screen.findByRole('heading', { level: 2, name: 'Aplicativo no celular' });
    const { event, prompt } = installEvent('accepted');
    act(() => void window.dispatchEvent(event));
    await user.click(await screen.findByRole('button', { name: 'Instalar o Alpha7' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Instalar o Alpha7' })).not.toBeInTheDocument();
  });

  it('se a pessoa recusar, não insiste: só avisa que a opção continua aqui', async () => {
    const { user } = renderApp({ path: '/configuracoes' });
    await screen.findByRole('heading', { level: 2, name: 'Aplicativo no celular' });
    act(() => void window.dispatchEvent(installEvent('dismissed').event));
    await user.click(await screen.findByRole('button', { name: 'Instalar o Alpha7' }));
    expect(await screen.findByText(/A instalação continua disponível aqui/)).toBeInTheDocument();
  });

  it('no iPhone mostra os três toques do Safari', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    renderApp({ path: '/configuracoes' });
    expect(await screen.findByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar o Alpha7' })).not.toBeInTheDocument();
  });

  it('aparece no índice de seções', async () => {
    renderApp({ path: '/configuracoes' });
    await screen.findByRole('heading', { level: 2, name: 'Aplicativo no celular' });
    expect(screen.getByRole('link', { name: 'Aplicativo no celular' })).toHaveAttribute('href', '#aplicativo');
  });
});

describe('Aviso de versão nova', () => {
  it('não aparece sem versão nova', async () => {
    renderApp({ path: '/' });
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    expect(screen.queryByText('Há uma versão nova do Alpha7')).not.toBeInTheDocument();
  });

  it('aparece com o botão de atualizar, que pede a troca ao service worker', async () => {
    const worker = await leaveUpdateWaiting();
    const { user } = renderApp({ path: '/' });
    expect(await screen.findByText('Há uma versão nova do Alpha7')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    expect(worker.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
  });

  it('nunca aparece no registro de treino nem na partida ao vivo (deslocaria os botões no meio de um toque)', async () => {
    await leaveUpdateWaiting();
    renderApp({ path: '/treinos/demo-t-01/registrar' });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Há uma versão nova do Alpha7')).not.toBeInTheDocument();
  });
});
