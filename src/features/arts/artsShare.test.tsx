import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import type { Lineup } from '@/domain/lineup';
import { makeMatch, makePlayer } from '@/test/factories';
import { renderApp } from '@/test/renderApp';

// O jsdom não desenha canvas: a conversão do SVG em PNG é trocada por um arquivo qualquer. O resto da tela é o real.
vi.mock('./artSvg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./artSvg')>()),
  svgToPng: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}));

const NOW = '2026-10-01T10:00:00.000Z';
const players = ['Ana Alves', 'Bia Borges', 'Cris Costa', 'Dani Dias', 'Eva Esteves', 'Fabi Faria', 'Gabi Gomes'].map((name, i) =>
  makePlayer({ id: `p${i + 1}`, name, jerseyNumber: i + 1, primaryPosition: i === 6 ? 'libero' : 'ponteiro' }),
);
const roles = ['levantador', 'oposto', 'ponteiro', 'central', 'ponteiro', 'central'] as const;
const lineup: Lineup = {
  id: 'l1',
  title: 'Titular',
  opponent: '',
  competition: '',
  scheduledAt: '',
  venue: '',
  formation: '5-1',
  starters: roles.map((role, i) => ({ playerId: `p${i + 1}`, role })),
  liberoId: 'p7',
  benchIds: [],
  createdAt: NOW,
  updatedAt: NOW,
  demo: false,
};
const ws = (): Workspace => ({
  ...createEmptyWorkspace(),
  players,
  lineups: [lineup],
  matches: [makeMatch({ id: 'm1', opponent: 'Rivais', scheduledAt: '2026-11-14T19:30', lineupId: 'l1' })],
});

function stubShare(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
  return navigator.share as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  vi.restoreAllMocks();
});

describe('Gerador de artes: compartilhar', () => {
  it('no computador (sem compartilhar arquivos) só existe Baixar PNG', async () => {
    renderApp({ path: '/artes', workspace: ws() });
    expect(await screen.findByRole('button', { name: 'Baixar PNG' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).not.toBeInTheDocument();
  });

  it('no celular, Compartilhar envia o PNG com o nome do arquivo e o título da partida', async () => {
    const share = stubShare(() => Promise.resolve());
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Compartilhar' }));
    await screen.findByText('Arte compartilhada.');
    const data = share.mock.calls[0]?.[0] as ShareData;
    expect(data.title).toBe('Alpha7 x Rivais');
    expect(data.files?.[0]?.name).toMatch(/\.png$/);
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeInTheDocument(); // o download continua à mão
  });

  it('fechar o menu de compartilhar não mostra erro nem sucesso', async () => {
    stubShare(() => Promise.reject(new DOMException('cancelado', 'AbortError')));
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Compartilhar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeEnabled());
    expect(screen.queryByText('Arte compartilhada.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('se o compartilhamento falhar, explica e aponta o download', async () => {
    stubShare(() => Promise.reject(new DOMException('sem permissão', 'NotAllowedError')));
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Compartilhar' }));
    expect(await screen.findByText(/Use “Baixar PNG” e envie o arquivo/)).toBeInTheDocument();
  });
});
