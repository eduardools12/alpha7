import { screen, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import { createUniformAttributes } from '@/domain/attributes';
import type { Lineup } from '@/domain/lineup';
import { makeEvaluation, makeMatch, makeMatchSet, makePlayer, makeRally } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

// O jsdom não desenha canvas nem baixa arquivos: só essas duas pontas são trocadas; o resto da tela é o real.
const exportMocks = vi.hoisted(() => ({ svgToPng: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('./exportPng', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exportPng')>()),
  svgToPng: exportMocks.svgToPng,
  downloadBlob: exportMocks.downloadBlob,
}));

beforeEach(() => {
  exportMocks.svgToPng.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  exportMocks.downloadBlob.mockReset();
});

const NOW = '2026-10-01T10:00:00.000Z';
const PHOTO = 'data:image/jpeg;base64,/9j/PHOTO';
const NAMES = ['Ana Alves', 'Bia Borges', 'Cris Costa', 'Dani Dias', 'Eva Esteves', 'Fabi Faria', 'Gabi Gomes', 'Hele Hugo'];
const players = NAMES.map((name, i) =>
  makePlayer({ id: `p${i + 1}`, name, jerseyNumber: i + 1, primaryPosition: i === 6 ? 'libero' : 'ponteiro', ...(i === 1 ? { photo: PHOTO } : {}) }),
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
  benchIds: ['p8'],
  createdAt: NOW,
  updatedAt: NOW,
  demo: false,
};
const next = makeMatch({ id: 'm1', opponent: 'Time <Vizinho> & Cia', competition: 'Copa', scheduledAt: '2026-11-14T19:30', venue: 'Ginásio', lineupId: 'l1' });
const done = makeMatch({ id: 'm2', opponent: 'Rivais', status: 'concluida', finalSetsUs: 3, finalSetsThem: 1, scheduledAt: '2026-10-10T20:00' });
const ids = players.slice(0, 6).map((p) => p.id);
const scores: [number, number][] = [[25, 20], [20, 25], [25, 22], [25, 18]];
const sets = scores.map((_, i) => makeMatchSet('m2', i + 1, ids));
const rallies = scores.flatMap(([us, them], i) =>
  [...Array<'us'>(us).fill('us'), ...Array<'them'>(them).fill('them')].map((winnerSide, seq) => makeRally('m2', i + 1, seq + 1, { winnerSide })),
);

const ws = (): Workspace => ({
  ...createEmptyWorkspace(),
  players,
  lineups: [lineup],
  matches: [next, done],
  matchSets: sets,
  rallies,
  evaluations: [makeEvaluation('p3', '2026-09-30', { ...createUniformAttributes(60), BLQ: 90 })],
});

const previewSvg = async (name: RegExp) => decodeURIComponent((await screen.findByRole('img', { name })).getAttribute('src') ?? '');

describe('página do gerador (modo local: sem papéis)', () => {
  it('abre na escalação da próxima partida: prévia, o que aparece e o botão de baixar', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    const img = await screen.findByRole('img', { name: /Prévia da arte: escalação contra Time <Vizinho> & Cia, formato Feed 4:5/ });
    const before = img.getAttribute('src');
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeEnabled();
    expect(screen.getByText(/#1 Ana A\./)).toBeInTheDocument();
    expect(await previewSvg(/Prévia da arte: escalação/)).toContain('ESCALAÇÃO OFICIAL');
    await user.click(screen.getByRole('button', { name: 'Fundo branco' }));
    expect((await screen.findByRole('img', { name: /Prévia/ })).getAttribute('src')).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Story 9:16' }));
    expect(screen.getByText(/Prévia no tamanho 1080 x 1920 px/)).toBeInTheDocument();
  });

  it('oferece todos os tipos de arte e cada um mostra as suas escolhas', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    const group = await screen.findByRole('group', { name: 'Tipo de arte' });
    for (const label of ['Escalação', 'Dia de jogo', 'Resultado', 'Atleta', 'Carta do atleta', 'Destaque', 'Capa de lances', 'Institucional', 'Capas de destaques']) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(within(group).getByRole('button', { name: 'Escalação' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Dia de jogo' }));
    expect(within(group).getByRole('button', { name: 'Dia de jogo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Rodada ou fase (opcional)')).toBeInTheDocument();
  });

  it('dia de jogo: usa a partida e a fase digitada; sem fase, ela não aparece', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Dia de jogo' }));
    const bare = await previewSvg(/Prévia da arte: dia de jogo contra Time <Vizinho> & Cia/);
    for (const part of ['DIA DE', 'SÁB 14/11', '19H30', 'COPA']) expect(bare).toContain(part);
    expect(bare).not.toContain('QUARTAS');
    await user.type(screen.getByLabelText('Rodada ou fase (opcional)'), 'Quartas de final');
    expect(await previewSvg(/Prévia da arte: dia de jogo/)).toContain('QUARTAS DE FINAL');
    expect(screen.getByText('Quartas de final', { selector: 'dd' })).toBeInTheDocument();
  });

  it('resultado: só partidas concluídas, com o placar vindo dos pontos registrados', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Resultado' }));
    const svg = await previewSvg(/Prévia da arte: resultado contra Rivais/);
    expect(svg).toContain('RESULTADO FINAL');
    expect(svg).toContain('PARCIAIS POR SET');
    expect(screen.getByText('3 x 1', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('25-20, 20-25, 25-22, 25-18', { selector: 'dd' })).toBeInTheDocument();
    const select = screen.getByLabelText('Partida concluída');
    expect(within(select).getAllByRole('option')).toHaveLength(1);
  });

  it('resultado sem partida concluída explica o que falta', async () => {
    const { user } = renderApp({ path: '/artes', workspace: { ...ws(), matches: [next] } });
    await user.click(await screen.findByRole('button', { name: 'Resultado' }));
    expect(await screen.findByText('Nenhuma partida concluída ainda')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar PNG' })).toBeDisabled();
  });

  it('atleta: nome completo, camisa e posição; foto do cadastro ganha enquadramento, sem foto avisa', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Atleta' }));
    // o primeiro da lista (ordem alfabética) é Ana, sem foto
    expect(await screen.findByRole('img', { name: /Prévia da arte: apresentação de Ana Alves/ })).toBeInTheDocument();
    expect(screen.getByText(/ainda não tem foto cadastrada/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Aproximar')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Atleta', { selector: 'select' }), 'p2');
    expect(await previewSvg(/Prévia da arte: apresentação de Bia Borges/)).toContain('BIA BORGES');
    expect(await screen.findByLabelText('Aproximar')).toBeInTheDocument();
    expect(screen.getByLabelText('Posição horizontal')).toBeInTheDocument();
    expect(screen.getByLabelText('Posição vertical')).toBeInTheDocument();
    expect(screen.queryByText(/ainda não tem foto cadastrada/)).not.toBeInTheDocument();
  });

  it('carta do atleta: Overall e atributos reais; sem avaliação aparece traço, nunca zero', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Carta do atleta' }));
    expect(await previewSvg(/Prévia da arte: carta de Ana Alves/)).toContain('SEM AVALIAÇÃO');
    expect(screen.getByText('Sem avaliação (aparece “—”)', { selector: 'dd' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Atleta', { selector: 'select' }), 'p3');
    expect(await previewSvg(/Prévia da arte: carta de Cris Costa/)).not.toContain('SEM AVALIAÇÃO');
    expect(screen.queryByText(/Sem avaliação \(aparece/)).not.toBeInTheDocument();
    expect(screen.getByText(/BLQ 90/)).toBeInTheDocument();
  });

  it('destaque: estatística pela metade bloqueia a arte e explica; completa, libera', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Destaque' }));
    expect(screen.getByText('Digite só números que você confirmou. Nada é preenchido sozinho.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Estatística 1: nome'), 'Pontos');
    expect(await screen.findByText('Não dá para gerar a arte ainda')).toBeInTheDocument();
    expect(screen.getByText(/Estatística 1: preencha o nome e o valor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeDisabled();
    await user.type(screen.getByLabelText('Estatística 1: valor'), '18');
    const svg = await previewSvg(/Prévia da arte: destaque de Ana Alves/);
    expect(svg).toContain('PONTOS');
    expect(svg).toContain('>18<');
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeEnabled();
  });

  it('capa de lances: título e chamada editáveis; o formato story vale para o tipo', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Capa de lances' }));
    expect(await previewSvg(/Prévia da arte: capa de lances de Ana Alves/)).toContain('COMPILADO DE');
    const title = screen.getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Ases');
    expect(await previewSvg(/Prévia da arte: capa de ases de Ana Alves/)).toContain('ASES');
    await user.click(screen.getByRole('button', { name: 'Story 9:16' }));
    expect(screen.getByText(/Prévia no tamanho 1080 x 1920 px/)).toBeInTheDocument();
    await user.clear(title);
    expect(await screen.findByText('Informe o título da capa (por exemplo, LANCES).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeDisabled();
  });

  it('institucional e capas de destaques funcionam sem partida nem atleta; capas só em quadrado', async () => {
    const { user } = renderApp({ path: '/artes', workspace: createEmptyWorkspace() });
    // sem partidas, a página abre numa peça que não depende de dados
    expect(await screen.findByRole('img', { name: /Prévia da arte: apresentação da equipe/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manifesto: três toques' }));
    expect(await previewSvg(/Prévia da arte: manifesto/)).toContain('TRÊS TOQUES.');
    await user.click(screen.getByRole('button', { name: 'Capas de destaques' }));
    expect(screen.queryByRole('group', { name: 'Formato' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Fundo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bastidores' }));
    expect(await screen.findByRole('img', { name: /Prévia da arte: capa de destaques bastidores, formato Quadrado 1:1/ })).toBeInTheDocument();
    expect(screen.getByText(/Prévia no tamanho 1080 x 1080 px/)).toBeInTheDocument();
  });

  it('sem partidas, escalação e dia de jogo convidam a cadastrar; sem atletas, as artes de atleta também', async () => {
    const { user } = renderApp({ path: '/artes', workspace: createEmptyWorkspace() });
    await user.click(await screen.findByRole('button', { name: 'Escalação' }));
    expect(await screen.findByText('Cadastre uma partida para gerar a arte')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar partida' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atleta' }));
    expect(await screen.findByText('Cadastre um atleta para gerar a arte')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Prévia/ })).not.toBeInTheDocument();
  });

  it('escalação incompleta bloqueia o botão e explica', async () => {
    renderApp({ path: '/artes', workspace: { ...ws(), lineups: [{ ...lineup, starters: [null, ...lineup.starters.slice(1)] }] } });
    expect(await screen.findByText('Não dá para gerar a arte ainda')).toBeInTheDocument();
    expect(screen.getByText(/falta a posição P1/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Baixar PNG' })).toBeDisabled();
  });

  it('baixar: gera o PNG do mesmo SVG da prévia, com o nome certo, e confirma na tela', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Baixar PNG' }));
    expect(await screen.findByText('PNG gerado: alpha7-escalacao-time-vizinho-cia-feed.png (1080 x 1350).')).toBeInTheDocument();
    expect(exportMocks.svgToPng).toHaveBeenCalledWith(expect.stringContaining('ESCALAÇÃO OFICIAL'), 1080, 1350);
    expect(exportMocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'alpha7-escalacao-time-vizinho-cia-feed.png');
  });

  it('se o navegador não conseguir gerar o PNG, explica e nada é baixado', async () => {
    exportMocks.svgToPng.mockRejectedValueOnce(new Error('O navegador não conseguiu desenhar a arte.'));
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    await user.click(await screen.findByRole('button', { name: 'Baixar PNG' }));
    expect(await screen.findByText('O navegador não conseguiu desenhar a arte.')).toBeInTheDocument();
    expect(exportMocks.downloadBlob).not.toHaveBeenCalled();
  });
});

describe('gerador só para a comissão técnica (cliente simulado)', () => {
  function seeded() {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
    seedWorkspace(fake, TEAM_A, ws());
    return fake;
  }

  it('o coach vê o item no menu e abre a página', async () => {
    const fake = seeded();
    fake.signInAs(USERS.coach.id);
    renderRemote(fake, { path: '/artes' });
    expect(await screen.findByRole('button', { name: 'Baixar PNG' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Gerador de artes' })).toBeInTheDocument();
  });

  it.each(['analyst', 'viewer'] as const)('%s não vê o item no menu e a rota direta é barrada com explicação', async (who) => {
    const fake = seeded();
    fake.signInAs(USERS[who].id);
    renderRemote(fake, { path: '/artes' });
    expect(await screen.findByText('Seu papel não permite esta ação')).toBeInTheDocument();
    expect(screen.getByText(/gerar artes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar PNG' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Prévia/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).queryByRole('link', { name: 'Gerador de artes' })).not.toBeInTheDocument();
  });
});
