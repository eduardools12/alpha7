import { makeEvent, makeMatch, makePlayer, makeRally, makeRallyAction, makeTraining } from '@/test/factories';
import {
  EMPTY_FILTER,
  OBSERVATION_GAP,
  byRotation,
  chartIndicator,
  contextComparison,
  hasFilter,
  indicatorEvolution,
  matchActionEvolution,
  matchDate,
  matchEvolution,
  observationsFor,
  periodComparison,
  playerMatches,
  positionComparison,
  previousPeriod,
  rallyIndicators,
  rotationOf,
  sampleOf,
  scope,
  trainingEvolution,
  type StatsData,
} from './stats';
import type { Rally } from './match';

/** Cenário com números conhecidos: tudo abaixo é conferido à mão. */
const pa = makePlayer({ id: 'pa', name: 'Ana Alves', jerseyNumber: 1, primaryPosition: 'ponteiro' });
const pb = makePlayer({ id: 'pb', name: 'Bia Borges', jerseyNumber: 2, primaryPosition: 'ponteiro' });
const pc = makePlayer({ id: 'pc', name: 'Cris Costa', jerseyNumber: 3, primaryPosition: 'central' });

const m1 = makeMatch({ id: 'm1', opponent: 'Rivais', scheduledAt: '2026-10-05T19:00', status: 'concluida', finalSetsUs: 3, finalSetsThem: 1, concludedAt: '2026-10-05T22:00:00.000Z' });
const m2 = makeMatch({ id: 'm2', opponent: 'Vizinhos', scheduledAt: '2026-10-12T19:00' });
const m3 = makeMatch({ id: 'm3', opponent: 'Fora do período', scheduledAt: '2026-09-01T19:00' });

const rally = (matchId: string, seq: number, serving: 'us' | 'them', winner: 'us' | 'them', rotation: number, extra: Partial<Rally> = {}) =>
  makeRally(matchId, 1, seq, { servingSide: serving, winnerSide: winner, rotation, ...extra });

// m1: 10 pontos ativos + 1 desfeito
const m1Rallies = [
  rally('m1', 1, 'us', 'us', 0, { serverPlayerId: 'pa', playerId: 'pa', id: 'r1' }),
  rally('m1', 2, 'us', 'us', 0, { serverPlayerId: 'pa' }),
  rally('m1', 3, 'us', 'them', 0, { serverPlayerId: 'pa' }),
  rally('m1', 4, 'them', 'us', 0),
  rally('m1', 5, 'us', 'us', 1, { serverPlayerId: 'pb' }),
  rally('m1', 6, 'us', 'them', 1, { serverPlayerId: 'pb' }),
  rally('m1', 7, 'them', 'them', 1),
  rally('m1', 8, 'them', 'us', 1),
  rally('m1', 9, 'us', 'us', 1, { serverPlayerId: 'pb' }),
  rally('m1', 10, 'them', 'them', 1),
  rally('m1', 11, 'us', 'us', 1, { serverPlayerId: 'pb', voidedAt: '2026-10-05T21:00:00.000Z' }), // desfeito: nunca conta
];
// m2: rotação 6 = rotação 0 do rodízio
const m2Rallies = [rally('m2', 1, 'them', 'us', 6), rally('m2', 2, 'them', 'them', 0)];
const m3Rallies = [rally('m3', 1, 'us', 'us', 0)];

const actions = [
  makeRallyAction('m1', 'r1', 'pa', 'saque', 'ace'),
  makeRallyAction('m1', 'r1', 'pa', 'saque', 'erro'),
  makeRallyAction('m1', 'r1', 'pa', 'saque', 'valido'),
  makeRallyAction('m1', 'r1', 'pa', 'saque', 'ace', { voidedAt: '2026-10-05T21:00:00.000Z' }), // desfeita
  makeRallyAction('m1', 'r1', 'pb', 'ataque', 'ponto'),
  makeRallyAction('m1', 'r1', 'pb', 'ataque', 'ponto'),
  makeRallyAction('m1', 'r1', 'pb', 'ataque', 'erro'),
  makeRallyAction('m3', 'r-x', 'pa', 'saque', 'ace'),
];

const t1 = makeTraining({ id: 't1', name: 'Treino 1', date: '2026-10-01', participantIds: ['pa', 'pb'] });
const t2 = makeTraining({ id: 't2', name: 'Treino 2', date: '2026-10-08', participantIds: ['pa', 'pb'] });
const trainingEvents = [
  makeEvent('t1', 'x', 'pa', 'recepcao', 'A'),
  makeEvent('t1', 'x', 'pa', 'recepcao', 'A'),
  makeEvent('t1', 'x', 'pa', 'recepcao', 'B'),
  makeEvent('t1', 'x', 'pa', 'recepcao', 'erro'),
  makeEvent('t2', 'x', 'pa', 'recepcao', 'C'),
  makeEvent('t2', 'x', 'pb', 'recepcao', 'A'),
  makeEvent('t2', 'x', 'pa', 'saque', 'ace'),
  makeEvent('t2', 'x', 'pa', 'recepcao', 'A', { voidedAt: '2026-10-08T12:00:00.000Z' }), // anulado
];

const data: StatsData = {
  players: [pa, pb, pc],
  trainings: [t1, t2],
  trainingEvents,
  matches: [m1, m2, m3],
  matchSets: [],
  rallies: [...m1Rallies, ...m2Rallies, ...m3Rallies],
  rallyActions: actions,
};

describe('recorte (filtros)', () => {
  it('sem filtro: tudo o que é válido; anulados ficam de fora', () => {
    const s = scope(data, EMPTY_FILTER);
    expect(s.trainings.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(s.trainingEvents).toHaveLength(7); // 8 menos 1 anulado
    expect(s.matches.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(s.rallies).toHaveLength(13); // 10 + 2 + 1, sem o desfeito
    expect(s.actions).toHaveLength(7); // 8 menos 1 desfeita
    expect(hasFilter(EMPTY_FILTER)).toBe(false);
  });

  it('período: treinos e partidas fora dele saem; a data da partida é a marcada para o jogo', () => {
    expect(matchDate(m1)).toBe('2026-10-05');
    expect(matchDate(makeMatch({ scheduledAt: '', createdAt: '2026-08-02T10:00:00.000Z' }))).toBe('2026-08-02');
    const s = scope(data, { ...EMPTY_FILTER, from: '2026-10-02', to: '2026-10-31' });
    expect(s.trainings.map((t) => t.id)).toEqual(['t2']);
    expect(s.matches.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(s.rallies.every((r) => r.matchId !== 'm3')).toBe(true);
    expect(s.actions.every((a) => a.matchId !== 'm3')).toBe(true);
    expect(s.trainingEvents.every((e) => e.trainingId === 't2')).toBe(true);
  });

  it('atleta e fundamento filtram registros; os pontos continuam sendo da equipe', () => {
    const s = scope(data, { ...EMPTY_FILTER, playerId: 'pa', fundamental: 'saque' });
    expect(s.actions.map((a) => a.playerId)).toEqual(['pa', 'pa', 'pa', 'pa']); // 3 de m1 + 1 de m3
    expect(s.trainingEvents.map((e) => e.fundamental)).toEqual(['saque']);
    expect(s.rallies).toHaveLength(13);
  });

  it('treino e partida específicos restringem só o seu lado', () => {
    const s = scope(data, { ...EMPTY_FILTER, trainingId: 't1', matchId: 'm2' });
    expect(s.trainings.map((t) => t.id)).toEqual(['t1']);
    expect(s.matches.map((m) => m.id)).toEqual(['m2']);
    expect(s.rallies).toHaveLength(2);
    expect(s.trainingEvents).toHaveLength(4);
    expect(s.actions).toHaveLength(0);
  });

  it('rotação filtra pontos e as ações ligadas a eles; rotação 6 é a rotação 1 do rodízio', () => {
    expect(rotationOf(m2Rallies[0] as Rally)).toBe(0);
    const s = scope(data, { ...EMPTY_FILTER, rotation: 1 });
    expect(s.rallies.every((r) => rotationOf(r) === 1)).toBe(true);
    expect(s.rallies).toHaveLength(6);
    expect(s.actions).toHaveLength(0); // as ações do cenário estão ligadas a um ponto da rotação 0
    const r0 = scope(data, { ...EMPTY_FILTER, rotation: 0 });
    expect(r0.rallies).toHaveLength(4 + 2 + 1);
  });

  it('dados de outra equipe nunca entram: o recorte só enxerga o que recebe', () => {
    const only = scope({ ...data, matches: [m2], rallies: m2Rallies, rallyActions: [], trainings: [], trainingEvents: [] }, EMPTY_FILTER);
    expect(only.rallies).toHaveLength(2);
    expect(only.actions).toHaveLength(0);
    expect(only.trainingEvents).toHaveLength(0);
  });
});

describe('side-out, ponto de saque e pontos', () => {
  it('m1: 6 de 10 pontos; side-out 2 de 4 (adversário sacava); ponto de saque 4 de 6 (Alpha7 sacava)', () => {
    const r = rallyIndicators(m1Rallies); // inclui o desfeito: ignorado
    expect(r.points).toMatchObject({ successes: 6, attempts: 10, value: 0.6 });
    expect(r.sideOut).toMatchObject({ successes: 2, attempts: 4, value: 0.5 });
    expect(r.breakPoint).toMatchObject({ successes: 4, attempts: 6 });
    expect(r.breakPoint.value).toBeCloseTo(2 / 3, 10);
  });

  it('sem pontos: tudo indisponível (null), nunca 0%', () => {
    const r = rallyIndicators([]);
    expect(r.points.value).toBeNull();
    expect(r.sideOut.value).toBeNull();
    expect(r.breakPoint.value).toBeNull();
    expect(sampleOf(r.sideOut)).toBe('none');
  });

  it('só saques do adversário: o ponto de saque do Alpha7 fica sem dados, não 0%', () => {
    const r = rallyIndicators([rally('x', 1, 'them', 'us', 0), rally('x', 2, 'them', 'them', 0)]);
    expect(r.sideOut).toMatchObject({ successes: 1, attempts: 2 });
    expect(r.breakPoint.attempts).toBe(0);
    expect(r.breakPoint.value).toBeNull();
  });

  it('por rotação: sempre seis linhas, com os números de cada uma (m1)', () => {
    const rows = byRotation(m1Rallies);
    expect(rows).toHaveLength(6);
    const [r0, r1, r2] = rows;
    expect(r0).toMatchObject({ rotation: 0, label: 'Rotação 1', rallies: 4 });
    expect(r0?.sideOut).toMatchObject({ successes: 1, attempts: 1 });
    expect(r0?.breakPoint).toMatchObject({ successes: 2, attempts: 3 });
    expect(r1).toMatchObject({ rotation: 1, rallies: 6 });
    expect(r1?.sideOut).toMatchObject({ successes: 1, attempts: 3 });
    expect(r1?.breakPoint).toMatchObject({ successes: 2, attempts: 3 });
    expect(r2).toMatchObject({ rallies: 0 });
    expect(r2?.sideOut.value).toBeNull(); // rotação sem pontos: sem dados
  });
});

describe('fundamentos observados', () => {
  it('ações técnicas de partida usam as mesmas fórmulas do treino, sem misturar as origens', () => {
    const rows = contextComparison(scope(data, EMPTY_FILTER).trainingEvents, scope(data, EMPTY_FILTER).actions);
    const serve = rows.find((r) => r.fundamental === 'saque');
    // partida: 2 aces em 5 saques (ace, erro, valido de m1, ace de m3 e... ) → conferido abaixo
    expect(serve?.match.attempts).toBe(4); // pa: ace, erro, valido (m1) + ace (m3); a desfeita não conta
    expect(serve?.match.context).toBe('2 de 4');
    expect(serve?.training.attempts).toBe(1);
    expect(serve?.training.context).toBe('1 de 1');
    const attack = rows.find((r) => r.fundamental === 'ataque');
    expect(attack?.match.display).toBe('33,3%'); // (2 pontos − 1 erro − 0) ÷ 3
    expect(attack?.match.context).toBe('(2 − 1 − 0) de 3 tentativas');
    expect(attack?.training.attempts).toBe(0);
    expect(attack?.training.display).toBe('—'); // sem tentativas de treino: indisponível, não 0%
  });

  it('um único registro é amostra pequena; nenhum é "sem dados"', () => {
    const rows = contextComparison([], [makeRallyAction('m', 'r', 'pa', 'saque', 'ace')]);
    const serve = rows.find((r) => r.fundamental === 'saque');
    expect(serve?.match.sample).toBe('small');
    expect(serve?.match.display).toBe('100,0%');
    expect(serve?.training.sample).toBe('none');
    expect(serve?.training.display).toBe('—');
  });

  it('evolução por partida e por treino, em ordem de data, sem pontos de dados vazios', () => {
    const matchPoints = matchEvolution([m2, m1, m3], data.rallies);
    expect(matchPoints.map((p) => p.matchId)).toEqual(['m3', 'm1', 'm2']);
    expect(matchPoints[1]?.sideOut).toMatchObject({ successes: 2, attempts: 4 });
    expect(matchEvolution([makeMatch({ id: 'vazia' })], [])).toEqual([]);
    const trainingPoints = trainingEvolution([t2, t1], validTraining(), 'recepcao');
    expect(trainingPoints.map((p) => p.id)).toEqual(['t1', 't2']);
    expect(trainingPoints[0]?.headline.context).toBe('4 recepções');
    expect(trainingEvolution([t1], validTraining(), 'bloqueio')).toEqual([]);
    const actionPoints = matchActionEvolution([m1, m2], scope(data, EMPTY_FILTER).actions, 'ataque');
    expect(actionPoints.map((p) => p.id)).toEqual(['m1']);
  });

  it('comparação entre atletas da mesma posição só ordena quem tem amostra adequada (≥ 10)', () => {
    const events = [
      ...Array.from({ length: 10 }, () => makeEvent('t1', 'x', 'pa', 'recepcao', 'A')),
      ...Array.from({ length: 12 }, () => makeEvent('t1', 'x', 'pb', 'recepcao', 'B')),
      makeEvent('t1', 'x', 'pc', 'recepcao', 'A'),
    ];
    const ponteiros = positionComparison(data.players, events, 'ponteiro', 'recepcao');
    expect(ponteiros.rows.map((r) => r.playerId)).toEqual(['pa', 'pb']); // pa: 3,00 · pb: 2,00
    expect(ponteiros.canCompare).toBe(true);
    const centrais = positionComparison(data.players, events, 'central', 'recepcao');
    expect(centrais.rows).toHaveLength(1);
    expect(centrais.canCompare).toBe(false); // um atleta, amostra pequena: não há comparação
    const poucos = positionComparison(data.players, events.slice(0, 10), 'ponteiro', 'recepcao');
    expect(poucos.canCompare).toBe(false); // só um tem amostra adequada
  });
});

const validTraining = () => scope(data, EMPTY_FILTER).trainingEvents;

describe('período anterior e comparação de períodos', () => {
  it('o período anterior tem o mesmo tamanho e termina na véspera', () => {
    expect(previousPeriod('2026-10-08', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(previousPeriod('2026-10-01', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' });
    expect(previousPeriod('2026-03-01', '2026-03-31')).toEqual({ from: '2026-01-29', to: '2026-02-28' });
    expect(previousPeriod('', '2026-10-14')).toBeNull();
    expect(previousPeriod('2026-10-14', '2026-10-01')).toBeNull();
  });

  it('só informa a diferença quando as duas amostras são adequadas', () => {
    const cur = [...Array.from({ length: 10 }, () => makeEvent('t', 'x', 'pa', 'recepcao', 'A')), makeEvent('t', 'x', 'pa', 'saque', 'ace')];
    const prev = [...Array.from({ length: 10 }, () => makeEvent('t', 'x', 'pa', 'recepcao', 'B')), makeEvent('t', 'x', 'pa', 'saque', 'erro')];
    const rows = periodComparison(cur, prev);
    const reception = rows.find((r) => r.fundamental === 'recepcao');
    expect(reception?.current.display).toBe('3,00');
    expect(reception?.previous.display).toBe('2,00');
    expect(reception?.difference).toBeCloseTo(1, 10);
    const serve = rows.find((r) => r.fundamental === 'saque');
    expect(serve?.difference).toBeNull(); // amostra pequena nos dois
    expect(rows.find((r) => r.fundamental === 'bloqueio')?.difference).toBeNull(); // sem dados
  });
});

describe('leitura individual', () => {
  const mine = Array.from({ length: 10 }, (_, i) => makeEvent('t', 'x', 'pa', 'recepcao', i < 8 ? 'A' : 'B')); // nota 2,80
  const others = [...Array.from({ length: 5 }, () => makeEvent('t', 'x', 'pb', 'recepcao', 'C')), ...Array.from({ length: 5 }, () => makeEvent('t', 'x', 'pb', 'recepcao', 'B'))];
  const team = [...mine, ...others]; // nota da equipe: (28 + 5 + 10) ÷ 20 = 2,15

  it('descreve a diferença com os números e as tentativas, e não conclui nada', () => {
    const list = observationsFor('treino', mine, team);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ fundamental: 'recepcao', context: 'treino', direction: 'acima' });
    expect(list[0]?.text).toBe('Nota interna (0 a 3) nos treinos: 2,80 (10 recepções), acima da média da equipe (2,15, 20 recepções).');
  });

  it('amostra pequena de qualquer lado ou diferença pequena: sem observação', () => {
    expect(observationsFor('treino', mine.slice(0, 9), team)).toEqual([]);
    expect(observationsFor('treino', mine, mine.slice(0, 9))).toEqual([]);
    const similar = [...mine, ...Array.from({ length: 10 }, (_, i) => makeEvent('t', 'x', 'pb', 'recepcao', i < 7 ? 'A' : 'B'))];
    expect(observationsFor('treino', mine, similar)).toEqual([]); // 2,80 contra 2,75: abaixo do limite de 0,30
    expect(OBSERVATION_GAP.receptionScore).toBe(0.3);
  });

  it('para fundamentos em %, a diferença mínima é de 10 pontos percentuais; a leitura vale por contexto', () => {
    const playerServes = Array.from({ length: 10 }, (_, i) => makeRallyAction('m', 'r', 'pa', 'saque', i < 4 ? 'ace' : 'valido')); // 40%
    const teamServes = [...playerServes, ...Array.from({ length: 10 }, (_, i) => makeRallyAction('m', 'r', 'pb', 'saque', i < 1 ? 'ace' : 'erro'))]; // 5 de 20 = 25%
    const list = observationsFor('partida', playerServes, teamServes);
    expect(list[0]?.text).toBe('Taxa de ace nas partidas: 40,0% (4 de 10), acima da média da equipe (25,0%, 5 de 20).');
  });

  it('resultados por partida do atleta: ações, pontos em que esteve envolvido e saques', () => {
    const rows = playerMatches(data, scope(data, EMPTY_FILTER), 'pa');
    const m1Row = rows.find((r) => r.match.id === 'm1');
    expect(m1Row).toMatchObject({ total: 3, involved: 1, servedRallies: 3, servedWon: 2 });
    expect(m1Row?.attempts).toEqual({ saque: 3 });
    expect(rows.map((r) => r.match.id)).toEqual(['m3', 'm1']); // m3 tem a ação de saque dela, em ordem de data
    expect(playerMatches(data, scope(data, EMPTY_FILTER), 'pc')).toEqual([]); // sem registros: não aparece
  });
});

describe('um percentual por fundamento (gráficos)', () => {
  it('cada fundamento tem um indicador em %, sempre com acertos e tentativas', () => {
    const ev = [
      makeRallyAction('m', 'r', 'pa', 'saque', 'ace'),
      makeRallyAction('m', 'r', 'pa', 'saque', 'valido'),
      makeRallyAction('m', 'r', 'pa', 'recepcao', 'A'),
      makeRallyAction('m', 'r', 'pa', 'recepcao', 'B'),
      makeRallyAction('m', 'r', 'pa', 'recepcao', 'C'),
      makeRallyAction('m', 'r', 'pa', 'ataque', 'ponto'),
      makeRallyAction('m', 'r', 'pa', 'ataque', 'erro'),
      makeRallyAction('m', 'r', 'pa', 'ataque', 'bloqueado'),
      makeRallyAction('m', 'r', 'pa', 'ataque', 'outra'),
      makeRallyAction('m', 'r', 'pa', 'levantamento', 'excelente'),
      makeRallyAction('m', 'r', 'pa', 'bloqueio', 'ponto'),
      makeRallyAction('m', 'r', 'pa', 'defesa', 'positiva'),
      makeRallyAction('m', 'r', 'pa', 'defesa', 'erro'),
    ];
    const pick = (f: Parameters<typeof chartIndicator>[0]) => chartIndicator(f, ev).ratio;
    expect(pick('saque')).toMatchObject({ successes: 1, attempts: 2 });
    expect(pick('recepcao')).toMatchObject({ successes: 2, attempts: 3 });
    expect(pick('ataque')).toMatchObject({ successes: 1, attempts: 4 });
    expect(pick('levantamento')).toMatchObject({ successes: 1, attempts: 1 });
    expect(pick('bloqueio')).toMatchObject({ successes: 1, attempts: 1 });
    expect(pick('defesa')).toMatchObject({ successes: 1, attempts: 2 });
    expect(chartIndicator('saque', []).ratio.value).toBeNull();
  });
});

describe('evolução do indicador sessão a sessão', () => {
  it('treinos e partidas aparecem na linha do tempo com a origem de cada ponto, sem somar as duas', () => {
    const points = indicatorEvolution(scope(data, EMPTY_FILTER), 'saque');
    // treino t2 (2026-10-08): 1 ace em 1 saque · partida m1 (2026-10-05): 1 ace em 2 (ace, erro... conta só a ação válida: ace, erro, valido = 1 de 3) · m3 (2026-09-01): 1 de 1
    expect(points.map((p) => [p.date, p.source, p.ratio.successes, p.ratio.attempts])).toEqual([
      ['2026-09-01', 'partida', 1, 1],
      ['2026-10-05', 'partida', 1, 3],
      ['2026-10-08', 'treino', 1, 1],
    ]);
  });

  it('sessão sem tentativas do fundamento não vira ponto (nem zero)', () => {
    expect(indicatorEvolution(scope(data, EMPTY_FILTER), 'bloqueio')).toEqual([]);
  });
});
