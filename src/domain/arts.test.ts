import { createUniformAttributes } from './attributes';
import {
  ART_FORMATS,
  ART_KIND_FORMATS,
  artDescription,
  artFilename,
  buildAthleteArt,
  buildBrandArt,
  buildCardArt,
  buildCoverArt,
  buildHighlightsArt,
  buildLineupArt,
  buildMatchdayArt,
  buildResultArt,
  buildSpotlightArt,
  formatFor,
  matchDateText,
  matchTimeText,
  toneForUniform,
} from './arts';
import type { Lineup } from './lineup';
import { matchState } from './match';
import { makeMatch, makeMatchSet, makePlayer, makeRally } from '@/test/factories';

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
const match = makeMatch({ id: 'm1', opponent: 'Time Arte', competition: 'Copa', scheduledAt: '2026-11-14T19:30', venue: 'Ginásio', lineupId: 'l1' });
const base = { format: 'feed', tone: 'dark' } as const;

describe('textos de data e horário', () => {
  it('dia da semana e data sem fuso; sem data, "a definir"', () => {
    expect(matchDateText('2026-11-14T19:30')).toBe('SÁB 14/11');
    expect(matchDateText('2026-11-15')).toBe('DOM 15/11');
    expect(matchDateText('')).toBe('A DEFINIR');
    expect(matchTimeText('2026-11-14T19:30')).toBe('19H30');
    expect(matchTimeText('2026-11-14T08:05')).toBe('08H05');
    expect(matchTimeText('2026-11-14')).toBe('A DEFINIR');
  });
});

describe('formatos e fundo', () => {
  it('cada tipo só aceita os seus formatos; capas de destaque são sempre quadradas', () => {
    expect(ART_FORMATS.feed).toMatchObject({ width: 1080, height: 1350 });
    expect(ART_FORMATS.story).toMatchObject({ width: 1080, height: 1920 });
    expect(ART_FORMATS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(formatFor('lineup', 'story')).toBe('story');
    expect(formatFor('lineup', 'square')).toBe('feed');
    expect(formatFor('cover', 'feed')).toBe('square');
    expect(ART_KIND_FORMATS.cover).toEqual(['square']);
  });

  it('uniforme roxo vira fundo escuro; branco, fundo claro', () => {
    expect(toneForUniform('purple')).toBe('dark');
    expect(toneForUniform('white')).toBe('light');
  });
});

describe('escalação', () => {
  it('reúne os dados reais: seis titulares, líbero, reservas, data e competição', () => {
    const built = buildLineupArt({ match, lineup, players, ...base });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model.starters.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(built.model.starters[0]).toMatchObject({ name: 'Ana A.', fullName: 'Ana Alves', position: 'Levantador' });
    expect(built.model.libero).toMatchObject({ number: 7, name: 'Gabi G.' });
    expect(built.model.reserves.map((p) => p.number)).toEqual([8]);
    expect(built.model.dateText).toContain('14');
    expect(built.model.opponent).toBe('Time Arte');
  });

  it('a foto só entra para quem a tem; sem data, "Data a definir"', () => {
    const photo = { href: 'data:image/jpeg;base64,AAAA', width: 640, height: 800 };
    const built = buildLineupArt({ match: { ...match, scheduledAt: '' }, lineup, players, photos: { p1: photo }, ...base });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model.starters[0]?.photo).toEqual(photo);
    expect(built.model.starters[1]?.photo).toBeUndefined();
    expect(built.model.dateText).toBe('Data a definir');
  });

  it('recusa escalação incompleta ou com atleta fora do elenco', () => {
    const incomplete = buildLineupArt({ match, lineup: { ...lineup, starters: [...lineup.starters.slice(0, 5), null] }, players, ...base });
    expect(incomplete).toMatchObject({ ok: false });
    if (!incomplete.ok) expect(incomplete.reason).toContain('falta a posição P6');
    const gone = buildLineupArt({ match, lineup, players: players.filter((p) => p.id !== 'p3'), ...base });
    expect(gone).toMatchObject({ ok: false, reason: 'A escalação tem um atleta que não está mais no elenco.' });
  });
});

describe('dia de jogo', () => {
  it('usa só o que está cadastrado e a fase digitada', () => {
    const built = buildMatchdayArt({ match, phase: '  Quartas de final ', ...base });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model).toMatchObject({ opponent: 'Time Arte', competition: 'Copa', phase: 'Quartas de final', dateText: 'SÁB 14/11', timeText: '19H30', venue: 'Ginásio' });
    const bare = buildMatchdayArt({ match: makeMatch({ opponent: 'Rivais' }), phase: '', ...base });
    if (!bare.ok) throw new Error(bare.reason);
    expect(bare.model).toMatchObject({ competition: '', phase: '', dateText: 'A DEFINIR', timeText: 'A DEFINIR', venue: '' });
  });

  it('recusa fase longa demais e partida sem adversário', () => {
    expect(buildMatchdayArt({ match, phase: 'x'.repeat(31), ...base })).toMatchObject({ ok: false });
    expect(buildMatchdayArt({ match: { ...match, opponent: ' ' }, phase: '', ...base })).toMatchObject({ ok: false });
  });
});

describe('resultado', () => {
  const finished = makeMatch({ id: 'mf', opponent: 'São João', status: 'concluida', finalSetsUs: 3, finalSetsThem: 1 });
  const ids = players.slice(0, 6).map((p) => p.id);
  const scores: [number, number][] = [[25, 20], [20, 25], [25, 22], [25, 18]];
  const sets = scores.map((_, i) => makeMatchSet('mf', i + 1, ids));
  const rallies = scores.flatMap(([us, them], i) => {
    const winners = [...Array<'us'>(us).fill('us'), ...Array<'them'>(them).fill('them')];
    return winners.map((winnerSide, seq) => makeRally('mf', i + 1, seq + 1, { winnerSide }));
  });

  it('o placar vem dos pontos registrados, set a set', () => {
    const built = buildResultArt({ match: finished, state: matchState(finished, sets, rallies), ...base });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model).toMatchObject({ setsUs: 3, setsThem: 1, opponent: 'São João' });
    expect(built.model.sets).toEqual([
      { number: 1, us: 25, them: 20 },
      { number: 2, us: 20, them: 25 },
      { number: 3, us: 25, them: 22 },
      { number: 4, us: 25, them: 18 },
    ]);
  });

  it('pontos anulados não contam e set sem pontos não aparece', () => {
    const voided = rallies.map((r) => (r.setNumber === 4 ? { ...r, voidedAt: NOW } : r));
    const built = buildResultArt({ match: finished, state: matchState(finished, sets, voided), ...base });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model.sets.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('só existe para partida concluída', () => {
    const open = makeMatch({ id: 'mo', status: 'em_andamento' });
    const built = buildResultArt({ match: open, state: matchState(open, [], []), ...base });
    expect(built).toMatchObject({ ok: false });
    if (!built.ok) expect(built.reason).toContain('concluída');
  });
});

describe('arte do atleta', () => {
  const player = makePlayer({ id: 'px', name: 'Pedro Almeida da Silva', jerseyNumber: 10, primaryPosition: 'central', secondaryPosition: 'oposto' });
  const photo = { href: 'data:image/jpeg;base64,AAAA' };

  it('apresentação: nome completo, camisa, posição e foto do cadastro', () => {
    const built = buildAthleteArt({ player, photo, ...base });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model.player).toMatchObject({ fullName: 'Pedro Almeida da Silva', name: 'Pedro S.', number: 10, position: 'Central', photo });
  });

  it('destaque: textos aparados, linhas vazias ignoradas, no máximo três', () => {
    const built = buildSpotlightArt({
      player,
      headline: ' Ataque de meio ',
      stats: [{ label: ' Pontos ', value: ' 18 ' }, { label: '', value: '' }, { label: 'Aces', value: '3' }, { label: 'Extra', value: '9' }],
      ...base,
    });
    if (!built.ok) throw new Error(built.reason);
    expect(built.model.headline).toBe('Ataque de meio');
    expect(built.model.stats).toEqual([{ label: 'Pontos', value: '18' }, { label: 'Aces', value: '3' }]);
  });

  it('destaque: estatística pela metade ou longa demais é recusada (nada é completado sozinho)', () => {
    expect(buildSpotlightArt({ player, headline: '', stats: [{ label: 'Pontos', value: '' }], ...base })).toMatchObject({ ok: false });
    expect(buildSpotlightArt({ player, headline: '', stats: [{ label: '', value: '7' }], ...base })).toMatchObject({ ok: false });
    expect(buildSpotlightArt({ player, headline: '', stats: [{ label: 'x'.repeat(17), value: '1' }], ...base })).toMatchObject({ ok: false });
    expect(buildSpotlightArt({ player, headline: '', stats: [{ label: 'Pontos', value: '123456789' }], ...base })).toMatchObject({ ok: false });
    expect(buildSpotlightArt({ player, headline: 'x'.repeat(35), stats: [], ...base })).toMatchObject({ ok: false });
  });

  it('carta: sem avaliação mostra traço (nunca 0); com avaliação, o traço do maior atributo', () => {
    const empty = buildCardArt({ player, overall: null, attributes: null, ...base });
    if (!empty.ok) throw new Error(empty.reason);
    expect(empty.model.overall).toBeNull();
    expect(empty.model.trait).toBeNull();
    expect(empty.model.attributes.map((a) => a.value)).toEqual([null, null, null, null, null, null]);
    expect(empty.model.secondaryPosition).toBe('Oposto');

    const rated = buildCardArt({ player, overall: 81, attributes: { ...createUniformAttributes(60), BLQ: 90 }, ...base });
    if (!rated.ok) throw new Error(rated.reason);
    expect(rated.model.overall).toBe(81);
    expect(rated.model.attributes.map((a) => a.key)).toEqual(['SAC', 'REC', 'LEV', 'ATA', 'BLQ', 'DEF']);
    expect(rated.model.attributes.find((a) => a.key === 'BLQ')?.value).toBe(90);
    expect(rated.model.trait).toEqual(expect.any(String));
  });

  it('capa de lances: título obrigatório e limites de tamanho', () => {
    const ok = buildHighlightsArt({ player, caption: 'COMPILADO DE', title: ' LANCES ', detail: 'Temporada 2026', ...base });
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.model).toMatchObject({ title: 'LANCES', caption: 'COMPILADO DE', detail: 'Temporada 2026' });
    expect(buildHighlightsArt({ player, caption: '', title: ' ', detail: '', ...base })).toMatchObject({ ok: false });
    expect(buildHighlightsArt({ player, caption: '', title: 'x'.repeat(15), detail: '', ...base })).toMatchObject({ ok: false });
    expect(buildHighlightsArt({ player, caption: 'x'.repeat(21), title: 'LANCES', detail: '', ...base })).toMatchObject({ ok: false });
  });
});

describe('nome do arquivo e descrição', () => {
  const player = makePlayer({ name: 'André Nunes' });
  const brand = buildBrandArt('manifesto', 'story', 'dark');
  const cover = buildCoverArt('jogos');

  it('sem acentos nem símbolos, estável para o mesmo conteúdo', () => {
    const lineupArt = buildLineupArt({ match: makeMatch({ opponent: 'Sociedade Esportiva São João' }), lineup, players, format: 'story', tone: 'dark' });
    if (!lineupArt.ok) throw new Error(lineupArt.reason);
    expect(artFilename(lineupArt.model)).toBe('alpha7-escalacao-sociedade-esportiva-sao-joao-story.png');
    const athlete = buildAthleteArt({ player, ...base });
    if (!athlete.ok) throw new Error(athlete.reason);
    expect(artFilename(athlete.model)).toBe('alpha7-atleta-andre-nunes-feed.png');
    expect(artFilename(brand)).toBe('alpha7-institucional-manifesto-story.png');
    expect(artFilename(cover)).toBe('alpha7-capa-jogos-square.png');
    const odd = buildMatchdayArt({ match: makeMatch({ opponent: '!!!' }), phase: '', ...base });
    if (!odd.ok) throw new Error(odd.reason);
    expect(artFilename(odd.model)).toBe('alpha7-dia-de-jogo-partida-feed.png');
  });

  it('descreve a arte para o texto alternativo da prévia', () => {
    const matchday = buildMatchdayArt({ match, phase: '', ...base });
    if (!matchday.ok) throw new Error(matchday.reason);
    expect(artDescription(matchday.model)).toBe('dia de jogo contra Time Arte');
    expect(artDescription(cover)).toBe('capa de destaques jogos');
  });
});
