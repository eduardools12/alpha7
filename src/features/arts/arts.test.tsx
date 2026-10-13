import { screen, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import type { Lineup } from '@/domain/lineup';
import { ART_FORMATS, artFilename, buildArtModel } from '@/domain/lineupArt';
import { makeMatch, makePlayer } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';
import { buildLineupArtSvg, svgToDataUrl } from './artSvg';

const NOW = '2026-10-01T10:00:00.000Z';
const NAMES = ['Ana Alves', 'Bia Borges', 'Cris Costa', 'Dani Dias', 'Eva Esteves', 'Fabi Faria', 'Gabi Gomes', 'Hele Hugo'];
const players = NAMES.map((name, i) => makePlayer({ id: `p${i + 1}`, name, jerseyNumber: i + 1, primaryPosition: i === 6 ? 'libero' : 'ponteiro' }));
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
const match = makeMatch({ id: 'm1', opponent: 'Time <Vizinho> & Cia', competition: 'Copa', scheduledAt: '2026-11-14T19:30', venue: 'Ginásio', lineupId: 'l1' });
const assets = { fontDataUri: 'data:font/woff2;base64,AAAA', logoWhite: 'data:image/png;base64,BBBB', logoPurple: 'data:image/png;base64,CCCC' };

const ws = (): Workspace => ({ ...createEmptyWorkspace(), players, lineups: [lineup], matches: [match] });

describe('modelo e desenho da arte (puros)', () => {
  const built = buildArtModel({ match, lineup, players, format: 'cartaz', uniform: 'purple' });
  if (!built.ok) throw new Error(built.reason);

  it('reúne os dados reais: seis titulares, líbero, reservas, data e competição', () => {
    expect(built.model.starters.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(built.model.libero).toMatchObject({ number: 7, name: 'Gabi G.' });
    expect(built.model.reserves.map((p) => p.number)).toEqual([8]);
    expect(built.model.dateText).toContain('14');
    expect(built.model.title).toBe('Escalação Oficial');
  });

  it('o SVG é determinístico, tem o tamanho do formato, os textos e o logo, e escapa o que foi digitado', () => {
    const a = buildLineupArtSvg(built.model, assets);
    expect(buildLineupArtSvg(built.model, assets)).toBe(a); // mesma entrada, mesma arte
    expect(a).toContain('width="1080" height="1350"');
    expect(a).toContain('ESCALAÇÃO OFICIAL');
    expect(a).toContain('ALPHA7 X TIME &lt;VIZINHO&gt; &amp; CIA');
    expect(a).not.toContain('<Vizinho>');
    expect(a).toContain('href="data:image/png;base64,BBBB"'); // logo branco no fundo roxo
    expect(a).toContain('#270949');
    for (const name of ['ANA A.', 'BIA B.', 'CRIS C.', 'DANI D.', 'EVA E.', 'FABI F.']) expect(a).toContain(name);
    expect(a).toContain('RESERVAS');
    expect(a).toContain('HELE H.');
    expect(a).not.toMatch(/<image[^>]+(?:jpg|jpeg|http)/); // nada de imagem externa nem de referência
    expect(svgToDataUrl(a).startsWith('data:image/svg+xml')).toBe(true);
  });

  it('uniforme branco usa fundo claro e o logo roxo; story tem 1080 x 1920', () => {
    const white = buildArtModel({ match, lineup, players, format: 'story', uniform: 'white' });
    if (!white.ok) throw new Error(white.reason);
    const svg = buildLineupArtSvg(white.model, assets);
    expect(svg).toContain('width="1080" height="1920"');
    expect(svg).toContain('href="data:image/png;base64,CCCC"');
    expect(svg).toContain('#f1eff4');
    expect(ART_FORMATS.cartaz).toMatchObject({ width: 1080, height: 1350 });
  });

  it('muda quando os dados mudam (a prévia acompanha as escolhas)', () => {
    const other = buildArtModel({ match: { ...match, opponent: 'Outro Time' }, lineup, players, format: 'cartaz', uniform: 'purple' });
    if (!other.ok) throw new Error(other.reason);
    expect(buildLineupArtSvg(other.model, assets)).not.toBe(buildLineupArtSvg(built.model, assets));
  });

  it('recusa escalação incompleta ou com atleta fora do elenco; nome de arquivo sem acentos', () => {
    const incomplete = buildArtModel({ match, lineup: { ...lineup, starters: [...lineup.starters.slice(0, 5), null] }, players, format: 'cartaz', uniform: 'purple' });
    expect(incomplete.ok).toBe(false);
    const gone = buildArtModel({ match, lineup, players: players.filter((p) => p.id !== 'p3'), format: 'cartaz', uniform: 'purple' });
    expect(gone.ok).toBe(false);
    expect(artFilename({ opponent: 'Sociedade Esportiva São João' }, 'story')).toBe('alpha7-escalacao-sociedade-esportiva-sao-joao-story.png');
    expect(artFilename({ opponent: '!!!' }, 'cartaz')).toBe('alpha7-escalacao-partida-cartaz.png');
  });
});

describe('página do gerador (modo local: sem papéis)', () => {
  it('mostra a prévia, o que aparece na arte e o botão de baixar; trocar o uniforme muda a prévia', async () => {
    const { user } = renderApp({ path: '/artes', workspace: ws() });
    const img = await screen.findByRole('img', { name: /Prévia da arte da escalação contra Time <Vizinho> & Cia/ });
    const before = img.getAttribute('src');
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeEnabled();
    expect(screen.getByText(/#1 Ana A\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Uniforme branco' }));
    expect((await screen.findByRole('img', { name: /Prévia/ })).getAttribute('src')).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Story 9:16' }));
    expect(screen.getByText(/Prévia no tamanho 1080 x 1920 px/)).toBeInTheDocument();
  });

  it('sem partidas, convida a cadastrar; escalação incompleta bloqueia o botão e explica', async () => {
    const empty = renderApp({ path: '/artes', workspace: createEmptyWorkspace() });
    expect(await screen.findByText('Cadastre uma partida para gerar a arte')).toBeInTheDocument();
    empty.unmount();
    renderApp({ path: '/artes', workspace: { ...ws(), lineups: [{ ...lineup, starters: [null, ...lineup.starters.slice(1)] }] } });
    expect(await screen.findByText('Não dá para gerar a arte ainda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar PNG' })).toBeDisabled();
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
    expect(screen.getByText(/gerar artes da escalação/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar PNG' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Prévia/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).queryByRole('link', { name: 'Gerador de artes' })).not.toBeInTheDocument();
  });
});
