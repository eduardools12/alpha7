import {
  DEFAULT_FORMAT,
  activeRallies,
  courtPositions,
  matchRecord,
  matchState,
  nextContext,
  planCancelEmptySet,
  planConclude,
  planRally,
  planStartSet,
  planVoidLast,
  reasonLabel,
  reasonProblem,
  reasonTotals,
  resultText,
  outcomeOf,
  scoreOf,
  setTarget,
  setterPosition,
  setWinner,
  setsToWin,
  validateFormat,
  validateMatchDraft,
  type Match,
  type MatchFormat,
  type MatchSet,
  type Rally,
  type RallyAction,
  type RallyInput,
  type Side,
  upcomingMatch,
  type StartSetInput,
} from './match';

const NOW = '2026-10-10T20:00:00.000Z';
const ROSTER = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
const ROLES = ['ponteiro', 'central', 'oposto', 'levantador', 'central', 'ponteiro'] as const;

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 'm1',
  opponent: 'Rivals FC',
  competition: 'Copa',
  scheduledAt: '2026-10-10T19:30',
  venue: 'Ginásio',
  lineupId: null,
  format: DEFAULT_FORMAT,
  status: 'em_andamento',
  finalSetsUs: null,
  finalSetsThem: null,
  concludedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeSet = (number: number, firstServer: Side = 'us'): MatchSet => ({
  matchId: 'm1',
  number,
  firstServer,
  starters: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((playerId, slot) => ({ slot, playerId, role: ROLES[slot] ?? 'ponteiro' })),
  liberoId: 'p7',
  createdAt: NOW,
});

/** Simula uma partida passo a passo usando os próprios planos do domínio (nada de estado montado à mão). */
class Game {
  match: Match;
  sets: MatchSet[] = [];
  rallies: Rally[] = [];
  actions: RallyAction[] = [];
  private counter = 0;
  constructor(format: MatchFormat = DEFAULT_FORMAT) {
    this.match = makeMatch({ format });
  }
  get state() {
    return matchState(this.match, this.sets, this.rallies);
  }
  startSet(firstServer: Side = 'us') {
    const state = this.state;
    const plan = planStartSet(state, { number: state.nextSetNumber ?? 99, firstServer, starters: makeSet(1).starters, liberoId: 'p7', createdAt: NOW }, ROSTER);
    if (!plan.ok) throw new Error(plan.reason);
    this.sets.push(plan.value.set);
    return plan.value.set;
  }
  point(winner: Side, extra: Partial<RallyInput> = {}) {
    const state = this.state;
    const current = state.current;
    if (!current) throw new Error('sem set');
    this.counter += 1;
    const input: RallyInput = {
      id: `r${this.counter}`,
      attemptKey: `k${this.counter}`,
      setNumber: current.set.number,
      expectedSeq: nextContext(current).seq,
      winner,
      reason: null,
      playerId: null,
      recordedAt: NOW,
      actions: [],
      ...extra,
    };
    const plan = planRally(state, this.rallies, this.actions, input, ROSTER);
    if (plan.ok && !plan.value.duplicate) {
      this.rallies.push(plan.value.rally);
      this.actions.push(...plan.value.actions);
    }
    return plan;
  }
  points(winner: Side, count: number) {
    for (let i = 0; i < count; i += 1) {
      const plan = this.point(winner);
      if (!plan.ok) throw new Error(plan.reason);
    }
  }
}

describe('formato e pontuação', () => {
  it('padrão: melhor de 5, 25 pontos, decisivo até 15, diferença mínima de 2', () => {
    expect(DEFAULT_FORMAT).toEqual({ bestOf: 5, setPoints: 25, decidingSetPoints: 15, minLead: 2 });
    expect(setsToWin(DEFAULT_FORMAT)).toBe(3);
    expect([1, 2, 3, 4, 5].map((n) => setTarget(DEFAULT_FORMAT, n))).toEqual([25, 25, 25, 25, 15]);
  });

  it('o set decisivo é o último do formato: 3º set de melhor de 3; melhor de 1 usa os pontos normais', () => {
    const bestOf3 = { ...DEFAULT_FORMAT, bestOf: 3 as const };
    expect([1, 2, 3].map((n) => setTarget(bestOf3, n))).toEqual([25, 25, 15]);
    expect(setsToWin(bestOf3)).toBe(2);
    const bestOf1 = { ...DEFAULT_FORMAT, bestOf: 1 as const };
    expect(setTarget(bestOf1, 1)).toBe(25);
    expect(setsToWin(bestOf1)).toBe(1);
  });

  it.each([
    [25, 23, 25, 2, 'us'],
    [23, 25, 25, 2, 'them'],
    [25, 24, 25, 2, null], // atingiu os 25, mas sem a diferença mínima
    [24, 25, 25, 2, null],
    [26, 24, 25, 2, 'us'], // fecha em 26 a 24
    [30, 29, 25, 2, null], // não há teto: segue até abrir a diferença
    [31, 29, 25, 2, 'us'],
    [24, 24, 25, 2, null],
    [25, 0, 25, 2, 'us'],
    [15, 13, 15, 2, 'us'],
    [15, 14, 15, 2, null],
    [25, 24, 25, 1, 'us'], // com diferença mínima 1, 25 a 24 fecha
    [10, 25, 25, 2, 'them'],
    [0, 0, 25, 2, null],
  ])('setWinner(%i x %i, alvo %i, diferença %i) = %s', (us, them, target, lead, expected) => {
    expect(setWinner(us, them, target, lead)).toBe(expected);
  });

  it('valida o formato', () => {
    expect(validateFormat(DEFAULT_FORMAT)).toBeNull();
    expect(validateFormat({ ...DEFAULT_FORMAT, bestOf: 4 as unknown as 3 })).toMatch(/1, 3 ou 5/);
    expect(validateFormat({ ...DEFAULT_FORMAT, setPoints: 0 })).toMatch(/Pontos do set/);
    expect(validateFormat({ ...DEFAULT_FORMAT, decidingSetPoints: 2.5 })).toMatch(/decisivo/);
    expect(validateFormat({ ...DEFAULT_FORMAT, minLead: 0 })).toMatch(/Diferença mínima/);
  });
});

describe('saque e rotação', () => {
  it('o primeiro saque é de quem foi definido para o set, e o Alpha7 começa na rotação 0', () => {
    const us = new Game();
    us.startSet('us');
    expect(nextContext(us.state.current!)).toEqual({ seq: 1, servingSide: 'us', rotation: 0, serverPlayerId: 'p1' });
    const them = new Game();
    them.startSet('them');
    expect(nextContext(them.state.current!)).toEqual({ seq: 1, servingSide: 'them', rotation: 0, serverPlayerId: null });
  });

  it('quem saca e ganha mantém o saque e a rotação', () => {
    const game = new Game();
    game.startSet('us');
    game.points('us', 3);
    expect(nextContext(game.state.current!)).toMatchObject({ seq: 4, servingSide: 'us', rotation: 0, serverPlayerId: 'p1' });
  });

  it('quem recebe e ganha conquista o saque e, se for o Alpha7, faz o rodízio (P2 vai para P1)', () => {
    const game = new Game();
    game.startSet('them');
    game.point('us'); // adversário sacava: Alpha7 ganhou o saque e girou
    expect(nextContext(game.state.current!)).toMatchObject({ servingSide: 'us', rotation: 1, serverPlayerId: 'p2' });
    game.point('us'); // sacando e ganhando: nada muda
    expect(nextContext(game.state.current!)).toMatchObject({ rotation: 1, serverPlayerId: 'p2' });
    game.point('them'); // perdeu o saque: sem rodízio, saque do adversário
    expect(nextContext(game.state.current!)).toMatchObject({ servingSide: 'them', rotation: 1, serverPlayerId: null });
    game.point('them'); // adversário sacando e ganhando: nada muda para o Alpha7
    expect(nextContext(game.state.current!)).toMatchObject({ servingSide: 'them', rotation: 1 });
    game.point('us'); // reconquista o saque: gira de novo
    expect(nextContext(game.state.current!)).toMatchObject({ servingSide: 'us', rotation: 2, serverPlayerId: 'p3' });
  });

  it('a ordem de saque acompanha a rotação e dá a volta completa em 6 rodízios', () => {
    const game = new Game();
    game.startSet('them');
    const servers: (string | null)[] = [];
    for (let i = 0; i < 7; i += 1) {
      game.point('us'); // ganha o saque
      servers.push(nextContext(game.state.current!).serverPlayerId);
      game.point('them'); // perde o saque
    }
    expect(servers).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p1', 'p2']);
    expect(nextContext(game.state.current!).rotation).toBe(7);
  });

  it('cada rally guarda quem sacava, a rotação e o sacador do momento', () => {
    const game = new Game();
    game.startSet('them');
    game.point('us');
    game.point('us');
    expect(game.rallies.map((r) => [r.seq, r.servingSide, r.rotation, r.serverPlayerId])).toEqual([
      [1, 'them', 0, null],
      [2, 'us', 1, 'p2'],
    ]);
  });

  it('a rotação reinicia na formação inicial do novo set, com o primeiro sacador dele', () => {
    const game = new Game();
    game.startSet('them');
    game.point('us');
    game.point('us');
    game.points('us', 23);
    expect(game.state.current?.winner).toBe('us');
    game.startSet('us'); // o set seguinte começa com outro primeiro sacador
    expect(nextContext(game.state.current!)).toEqual({ seq: 1, servingSide: 'us', rotation: 0, serverPlayerId: 'p1' });
  });

  it('as posições de quadra acompanham a rotação e o levantador gira junto', () => {
    const set = makeSet(1);
    expect(courtPositions(set, 0).map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(courtPositions(set, 1).map((s) => s.playerId)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p1']);
    expect(setterPosition(set, 0)).toBe(4); // levantador começa em P4
    expect(setterPosition(set, 1)).toBe(3);
    expect(setterPosition(set, 4)).toBe(6);
    expect(setterPosition(set, 6)).toBe(4); // volta ao ponto de partida
  });

  it('o papel de cada atleta vem da formação inicial, não da posição habitual (o levantador não "vira" outro papel)', () => {
    const set = makeSet(1);
    expect(courtPositions(set, 2).map((s) => s.role)).toEqual(['oposto', 'levantador', 'central', 'ponteiro', 'ponteiro', 'central']);
  });

  it('motivos coerentes com quem sacava', () => {
    expect(reasonProblem('ace', 'us', 'us')).toBeNull();
    expect(reasonProblem('ace', 'them', 'us')).toMatch(/Ace/);
    expect(reasonProblem('erro_saque', 'us', 'them')).toBeNull(); // adversário sacava e errou o saque
    expect(reasonProblem('erro_saque', 'us', 'us')).toMatch(/Erro de saque/);
    expect(reasonProblem('erro_recepcao', 'us', 'us')).toBeNull(); // quem recebia (adversário) errou
    expect(reasonProblem('erro_recepcao', 'us', 'them')).toMatch(/recepção/);
    expect(reasonProblem(null, 'us', 'them')).toBeNull();
    expect(reasonProblem('ataque', 'them', 'us')).toBeNull();
  });
});

describe('registro de rallies e fechamento do set', () => {
  it('o placar soma os rallies ativos; o set NÃO fecha em 25 a 24 e fecha em 26 a 24', () => {
    const game = new Game();
    game.startSet('us');
    game.points('us', 24);
    game.points('them', 24);
    game.point('us'); // 25 a 24
    expect(game.state.current).toMatchObject({ score: { us: 25, them: 24 }, winner: null, closed: false });
    game.point('us'); // 26 a 24
    expect(game.state.current).toMatchObject({ score: { us: 26, them: 24 }, winner: 'us', closed: true });
    expect(game.state.setsUs).toBe(1);
  });

  it('o set fecha em 25 a 23 e não aceita mais pontos', () => {
    const game = new Game();
    game.startSet('us');
    game.points('them', 23);
    game.points('us', 25);
    expect(game.state.current?.closed).toBe(true);
    const extra = game.point('us');
    expect(extra.ok).toBe(false);
    expect(!extra.ok && extra.reason).toMatch(/encerrado/);
    expect(scoreOf(game.rallies)).toEqual({ us: 25, them: 23 });
  });

  it('o set decisivo fecha em 15 (diferença de 2) e o formato pode ser adaptado', () => {
    const game = new Game({ bestOf: 3, setPoints: 21, decidingSetPoints: 11, minLead: 2 });
    game.startSet('us');
    game.points('us', 21);
    game.startSet('them');
    game.points('them', 21);
    game.startSet('us');
    expect(game.state.current?.target).toBe(11);
    game.points('us', 10);
    game.points('them', 10);
    game.point('us'); // 11 a 10: sem diferença
    expect(game.state.current?.closed).toBe(false);
    game.point('us'); // 12 a 10
    expect(game.state.current?.winner).toBe('us');
  });

  it('recusa registrar sem set em andamento, em set que não é o atual e em partida concluída', () => {
    const game = new Game();
    expect(game.state.current).toBeNull();
    const none = planRally(game.state, [], [], baseInput(), ROSTER);
    expect(none.ok).toBe(false);
    game.startSet('us');
    const wrongSet = planRally(game.state, [], [], { ...baseInput(), setNumber: 2 }, ROSTER);
    expect(wrongSet.ok).toBe(false);
    const concluded = new Game();
    concluded.startSet('us');
    concluded.match = { ...concluded.match, status: 'concluida' };
    const plan = planRally(concluded.state, [], [], baseInput(), ROSTER);
    expect(!plan.ok && plan.reason).toMatch(/concluída/);
  });

  it('detecta conflito: se o número esperado não é o próximo, nada é gravado', () => {
    const game = new Game();
    game.startSet('us');
    game.point('us');
    const stale = game.point('them', { expectedSeq: 1 }); // outra pessoa já registrou o rally 1
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.conflict).toBe(true);
    expect(game.rallies).toHaveLength(1);
  });

  it('é idempotente: repetir o mesmo envio (mesma chave) não duplica o ponto, mesmo com o placar já mudado', () => {
    const game = new Game();
    game.startSet('us');
    const first = game.point('us', { attemptKey: 'toque-1' });
    expect(first.ok && first.value.duplicate).toBe(false);
    game.point('them');
    const again = game.point('us', { attemptKey: 'toque-1', expectedSeq: 1 });
    expect(again.ok && again.value.duplicate).toBe(true);
    expect(game.rallies).toHaveLength(2);
    expect(scoreOf(game.rallies)).toEqual({ us: 1, them: 1 });
  });

  it('a chave de um rally desfeito continua ocupada: o mesmo toque não ressuscita', () => {
    const game = new Game();
    game.startSet('us');
    game.point('us', { attemptKey: 'toque-1' });
    const last = game.state.lastRally!;
    game.rallies = game.rallies.map((r) => (r.id === last.id ? { ...r, voidedAt: NOW } : r));
    const again = game.point('us', { attemptKey: 'toque-1' });
    expect(again.ok && again.value.duplicate).toBe(true);
    expect(activeRallies(game.rallies)).toHaveLength(0);
  });

  it('recusa motivo incoerente, atleta fora do elenco e ação técnica inválida, sem gravar nada', () => {
    const game = new Game();
    game.startSet('us');
    expect(game.point('them', { reason: 'ace' }).ok).toBe(false); // ace de quem não sacava
    expect(game.point('us', { playerId: 'fantasma' }).ok).toBe(false);
    expect(game.point('us', { actions: [{ id: 'a1', attemptKey: 'ka1', playerId: 'p1', fundamental: 'recepcao', outcome: 'ace' }] }).ok).toBe(false);
    expect(game.point('us', { actions: [{ id: 'a1', attemptKey: 'ka1', playerId: 'fantasma', fundamental: 'saque', outcome: 'ace' }] }).ok).toBe(false);
    expect(game.rallies).toHaveLength(0);
  });

  it('um rally pode ter várias ações técnicas, ou nenhuma, e elas ficam ligadas ao rally e à partida', () => {
    const game = new Game();
    game.startSet('us');
    const none = game.point('us');
    expect(none.ok && none.value.actions).toEqual([]);
    const withActions = game.point('us', {
      reason: 'ace',
      playerId: 'p1',
      actions: [
        { id: 'a1', attemptKey: 'ka1', playerId: 'p1', fundamental: 'saque', outcome: 'ace' },
        { id: 'a2', attemptKey: 'ka2', playerId: 'p4', fundamental: 'levantamento', outcome: 'excelente' },
        { id: 'a3', attemptKey: 'ka3', playerId: 'p2', fundamental: 'ataque', outcome: 'outra' },
      ],
    });
    expect(withActions.ok).toBe(true);
    expect(game.actions).toHaveLength(3);
    expect(game.actions.every((a) => a.matchId === 'm1' && a.rallyId === game.rallies[1]?.id && a.voidedAt === null)).toBe(true);
    expect(game.actions.map((a) => a.fundamental)).toEqual(['saque', 'levantamento', 'ataque']);
    // ação técnica sem desfecho de ponto: um ataque "outra tentativa" não vira ponto nem erro
    expect(game.rallies[1]?.reason).toBe('ace');
  });

  it('não repete a chave de uma ação técnica', () => {
    const game = new Game();
    game.startSet('us');
    game.point('us', { actions: [{ id: 'a1', attemptKey: 'ka1', playerId: 'p1', fundamental: 'saque', outcome: 'ace' }] });
    const repeated = game.point('us', { actions: [{ id: 'a2', attemptKey: 'ka1', playerId: 'p1', fundamental: 'saque', outcome: 'ace' }] });
    expect(repeated.ok).toBe(false);
  });
});

function baseInput(): RallyInput {
  return { id: 'rx', attemptKey: 'kx', setNumber: 1, expectedSeq: 1, winner: 'us', reason: null, playerId: null, recordedAt: NOW, actions: [] };
}

describe('desfazer e corrigir', () => {
  it('só o último rally ativo da partida pode ser desfeito, e o placar volta', () => {
    const game = new Game();
    game.startSet('us');
    game.point('us');
    game.point('them');
    const last = game.state.lastRally!;
    expect(planVoidLast(game.state, game.rallies[0]!.id)).toMatchObject({ ok: false, conflict: true });
    const plan = planVoidLast(game.state, last.id);
    expect(plan.ok).toBe(true);
    game.rallies = game.rallies.map((r) => (r.id === last.id ? { ...r, voidedAt: NOW } : r));
    expect(scoreOf(game.rallies)).toEqual({ us: 1, them: 0 });
    // o próximo rally reaproveita o número do que foi desfeito
    expect(nextContext(game.state.current!).seq).toBe(2);
  });

  it('desfazer um ponto que fechou o set reabre o set (fluxo explícito de correção)', () => {
    const game = new Game();
    game.startSet('us');
    game.points('them', 23);
    game.points('us', 25);
    expect(game.state.current?.closed).toBe(true);
    const last = game.state.lastRally!;
    game.rallies = game.rallies.map((r) => (r.id === last.id ? { ...r, voidedAt: NOW } : r));
    expect(game.state.current).toMatchObject({ closed: false, score: { us: 24, them: 23 } });
    expect(game.point('us').ok).toBe(true);
  });

  it('não há o que desfazer em set vazio, e partida concluída exige reabrir antes', () => {
    const game = new Game();
    game.startSet('us');
    expect(planVoidLast(game.state, 'qualquer').ok).toBe(false);
    game.point('us');
    game.match = { ...game.match, status: 'concluida' };
    const plan = planVoidLast(game.state, game.state.lastRally!.id);
    expect(!plan.ok && plan.reason).toMatch(/Reabra/);
  });

  it('não desfaz ponto de set anterior enquanto existe um set novo em andamento', () => {
    const game = new Game();
    game.startSet('us');
    game.points('us', 25);
    game.startSet('them');
    expect(game.state.lastRally).toBeNull(); // o set atual está vazio: nada a desfazer nele
    expect(planVoidLast(game.state, game.rallies[24]!.id).ok).toBe(false);
  });

  it('cancelar um set só vale para o último e se nunca teve registros (nem desfeitos)', () => {
    const game = new Game();
    game.startSet('us');
    expect(planCancelEmptySet(game.state, 1, game.rallies).ok).toBe(true);
    game.point('us');
    expect(planCancelEmptySet(game.state, 1, game.rallies)).toMatchObject({ ok: false });
    // desfazer o ponto não libera o cancelamento: o rally desfeito continua no histórico
    game.rallies = game.rallies.map((r) => ({ ...r, voidedAt: NOW }));
    expect(planCancelEmptySet(game.state, 1, game.rallies)).toMatchObject({ ok: false });
    expect(planCancelEmptySet(game.state, 2, game.rallies)).toMatchObject({ ok: false, conflict: true });
  });
});

describe('sets e partida', () => {
  function wonSet(game: Game, winner: Side, firstServer: Side = 'us') {
    game.startSet(firstServer);
    game.points(winner, 25);
  }

  it('só se inicia o próximo set depois que o atual fecha', () => {
    const game = new Game();
    expect(game.state.nextSetNumber).toBe(1);
    game.startSet('us');
    expect(game.state.nextSetNumber).toBeNull();
    const early = planStartSet(game.state, { number: 2, firstServer: 'us', starters: makeSet(1).starters, liberoId: null, createdAt: NOW }, ROSTER);
    expect(early.ok).toBe(false);
    game.points('us', 25);
    expect(game.state.nextSetNumber).toBe(2);
  });

  it('a partida fica decidida com a maioria dos sets (3 de 5) e não admite mais sets', () => {
    const game = new Game();
    wonSet(game, 'us');
    wonSet(game, 'them', 'them');
    wonSet(game, 'us');
    expect(game.state).toMatchObject({ setsUs: 2, setsThem: 1, decided: null, nextSetNumber: 4 });
    wonSet(game, 'us', 'them');
    expect(game.state).toMatchObject({ setsUs: 3, setsThem: 1, decided: 'us', nextSetNumber: null });
    const extra = planStartSet(game.state, { number: 5, firstServer: 'us', starters: makeSet(1).starters, liberoId: null, createdAt: NOW }, ROSTER);
    expect(!extra.ok && extra.reason).toMatch(/decidida/);
  });

  it('o set decisivo (5º) só existe se está 2 a 2', () => {
    const game = new Game();
    wonSet(game, 'us');
    wonSet(game, 'them');
    wonSet(game, 'us');
    wonSet(game, 'them');
    expect(game.state).toMatchObject({ setsUs: 2, setsThem: 2, nextSetNumber: 5 });
    game.startSet('us');
    expect(game.state.current?.target).toBe(15);
    game.points('us', 15);
    expect(game.state.decided).toBe('us');
  });

  it('valida a formação inicial do set', () => {
    const game = new Game();
    const base: StartSetInput = { number: 1, firstServer: 'us', starters: makeSet(1).starters, liberoId: null, createdAt: NOW };
    const bad = (patch: Partial<typeof base>) => planStartSet(game.state, { ...base, ...patch }, ROSTER);
    expect(bad({ starters: base.starters.slice(0, 5) }).ok).toBe(false);
    expect(bad({ starters: base.starters.map((s) => ({ ...s, playerId: 'p1' })) }).ok).toBe(false);
    expect(bad({ starters: base.starters.map((s, i) => ({ ...s, slot: i === 5 ? 0 : s.slot })) }).ok).toBe(false);
    expect(bad({ starters: base.starters.map((s, i) => (i === 0 ? { ...s, playerId: 'fantasma' } : s)) }).ok).toBe(false);
    expect(bad({ liberoId: 'p1' }).ok).toBe(false); // líbero não pode estar entre os titulares
    expect(bad({ liberoId: 'fantasma' }).ok).toBe(false);
    expect(bad({ number: 2 }).ok).toBe(false);
    expect(bad({ liberoId: 'p7' }).ok).toBe(true);
    expect(bad({}).ok).toBe(true);
  });

  it('resultado: só sets fechados contam, e encerrar antes do fim avisa do set em andamento', () => {
    const game = new Game();
    expect(planConclude(game.state).ok).toBe(false); // sem sets
    wonSet(game, 'us');
    game.startSet('them');
    game.points('us', 10);
    game.points('them', 12);
    const plan = planConclude(game.state);
    expect(plan.ok && plan.value).toMatchObject({ finalSetsUs: 1, finalSetsThem: 0, decided: false });
    expect(plan.ok && plan.value.unfinishedSet?.score).toEqual({ us: 10, them: 12 });
  });

  it('partida decidida conclui sem aviso', () => {
    const game = new Game();
    wonSet(game, 'us');
    wonSet(game, 'us', 'them');
    wonSet(game, 'them');
    wonSet(game, 'us');
    const plan = planConclude(game.state);
    expect(plan.ok && plan.value).toMatchObject({ finalSetsUs: 3, finalSetsThem: 1, unfinishedSet: null, decided: true });
  });

  it('partida já concluída não conclui de novo', () => {
    const game = new Game();
    wonSet(game, 'us');
    game.match = { ...game.match, status: 'concluida', finalSetsUs: 1, finalSetsThem: 0 };
    expect(planConclude(game.state).ok).toBe(false);
  });

  it('ignora sets e rallies de outras partidas', () => {
    const game = new Game();
    game.startSet('us');
    game.point('us');
    const otherSet: MatchSet = { ...makeSet(1), matchId: 'outra' };
    const otherRally: Rally = { ...game.rallies[0]!, id: 'ro', matchId: 'outra', attemptKey: 'ko' };
    const state = matchState(game.match, [...game.sets, otherSet], [...game.rallies, otherRally]);
    expect(state.sets).toHaveLength(1);
    expect(state.current?.score).toEqual({ us: 1, them: 0 });
  });
});

describe('textos e formulário', () => {
  it('rótulos do motivo seguem o ponto de vista de quem ganhou o ponto', () => {
    expect(reasonLabel('ace', 'us')).toBe('Ace');
    expect(reasonLabel('ace', 'them')).toBe('Ace sofrido');
    expect(reasonLabel('erro_saque', 'us')).toBe('Erro de saque do adversário');
    expect(reasonLabel('erro_saque', 'them')).toBe('Erro de saque do Alpha7');
    expect(reasonLabel('erro_outro', 'us')).toBe('Erro do adversário');
    expect(reasonLabel('bloqueio', 'them')).toBe('Bloqueio do adversário');
    expect(reasonLabel('outro', 'us')).toBe('Outro motivo');
  });

  it('totais por motivo: rally sem motivo fica à parte e anulados não contam', () => {
    const game = new Game();
    game.startSet('us');
    game.point('us', { reason: 'ace' });
    game.point('us', { reason: 'ace' });
    game.point('us');
    game.point('them', { reason: 'ataque' });
    game.rallies[0] = { ...game.rallies[0]!, voidedAt: NOW };
    const totals = reasonTotals(game.rallies);
    expect(totals).toContainEqual({ reason: 'ace', winner: 'us', count: 1 });
    expect(totals).toContainEqual({ reason: null, winner: 'us', count: 1 });
    expect(totals).toContainEqual({ reason: 'ataque', winner: 'them', count: 1 });
  });

  it('resultado e desfecho', () => {
    expect(resultText(makeMatch())).toBeNull();
    const done = makeMatch({ status: 'concluida', finalSetsUs: 3, finalSetsThem: 1 });
    expect(resultText(done)).toBe('3 x 1');
    expect(outcomeOf(done)).toBe('vitoria');
    expect(outcomeOf({ ...done, finalSetsUs: 0, finalSetsThem: 3 })).toBe('derrota');
    expect(outcomeOf(makeMatch())).toBeNull();
  });

  it('valida o cadastro da partida', () => {
    const draft = { opponent: '  Rivals FC ', competition: ' Copa ', scheduledAt: '2026-10-10T19:30', venue: '', lineupId: null, format: DEFAULT_FORMAT };
    expect(validateMatchDraft(draft)).toEqual({ ok: true, value: { ...draft, opponent: 'Rivals FC', competition: 'Copa' } });
    const bad = validateMatchDraft({ ...draft, opponent: ' ', scheduledAt: 'amanhã', format: { ...DEFAULT_FORMAT, minLead: 0 } });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['format', 'opponent', 'scheduledAt']);
  });
});

describe('resumo para o dashboard', () => {
  const base = (id: string, overrides: Partial<Match>): Match => ({
    id,
    opponent: id,
    competition: '',
    scheduledAt: '',
    venue: '',
    lineupId: null,
    format: { ...DEFAULT_FORMAT },
    status: 'agendada',
    finalSetsUs: null,
    finalSetsThem: null,
    concludedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  });
  const done = (id: string, us: number, them: number) => base(id, { status: 'concluida', finalSetsUs: us, finalSetsThem: them, concludedAt: '2026-10-02T10:00:00.000Z' });

  it('só partidas concluídas contam, e vitória é ter mais sets', () => {
    expect(matchRecord([])).toEqual({ played: 0, wins: 0 });
    const list = [done('a', 3, 1), done('b', 1, 3), done('c', 3, 0), base('d', { status: 'em_andamento' }), base('e', {})];
    expect(matchRecord(list)).toEqual({ played: 3, wins: 2 });
  });

  it('a próxima partida é a em andamento; senão a agendada mais próxima; sem data vai por último; concluída nunca', () => {
    expect(upcomingMatch([])).toBeNull();
    expect(upcomingMatch([done('a', 3, 0)])).toBeNull();
    const later = base('later', { scheduledAt: '2026-12-01T19:00' });
    const sooner = base('sooner', { scheduledAt: '2026-11-01T19:00' });
    const undated = base('undated', {});
    expect(upcomingMatch([undated, later, sooner])?.id).toBe('sooner');
    expect(upcomingMatch([undated])?.id).toBe('undated');
    expect(upcomingMatch([sooner, base('live', { status: 'em_andamento' })])?.id).toBe('live');
  });
});
