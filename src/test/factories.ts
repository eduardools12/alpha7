import { createUniformAttributes, type Attributes } from '@/domain/attributes';
import { toFundamentalResult, type Fundamental } from '@/domain/fundamentals';
import { DEFAULT_FORMAT, type Match, type MatchSet, type Rally, type RallyAction, type SetStarter } from '@/domain/match';
import type { Evaluation, Player } from '@/domain/player';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';

let counter = 0;

export function makePlayer(overrides: Partial<Player> = {}): Player {
  counter += 1;
  return {
    id: `p${counter}`,
    name: `Atleta Teste ${counter}`,
    jerseyNumber: counter,
    primaryPosition: 'ponteiro',
    secondaryPosition: null,
    status: 'ativo',
    uniform: 'purple',
    coachNotes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    demo: false,
    ...overrides,
  };
}

export function makeTraining(overrides: Partial<Training> = {}): Training {
  counter += 1;
  return {
    id: `t${counter}`,
    name: `Treino ${counter}`,
    date: '2026-10-01',
    durationMinutes: 90,
    description: '',
    notes: '',
    responsible: '',
    participantIds: [],
    status: 'aberto',
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    demo: false,
    ...overrides,
  };
}

export function makeExercise(trainingId: string, overrides: Partial<TrainingExercise> = {}): TrainingExercise {
  counter += 1;
  return {
    id: `x${counter}`,
    trainingId,
    name: `Exercício ${counter}`,
    focus: null,
    order: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Evento válido de treino; lança se o resultado não pertencer ao fundamento (erro de teste). */
export function makeEvent(
  trainingId: string,
  exerciseId: string,
  playerId: string,
  fundamental: Fundamental,
  outcome: string,
  overrides: Partial<Pick<TrainingEvent, 'id' | 'recordedAt' | 'attemptKey' | 'voidedAt'>> = {},
): TrainingEvent {
  counter += 1;
  const result = toFundamentalResult(fundamental, outcome);
  if (!result) throw new Error(`Resultado inválido na fábrica: ${fundamental}/${outcome}`);
  return {
    ...result,
    id: `ev${counter}`,
    trainingId,
    exerciseId,
    playerId,
    recordedAt: `2026-10-01T10:${String(counter % 60).padStart(2, '0')}:00.000Z`,
    attemptKey: `ak${counter}`,
    voidedAt: null,
    demo: false,
    ...overrides,
  };
}

export function makeEvaluation(
  playerId: string,
  evaluatedAt: string,
  attributes: Attributes = createUniformAttributes(70),
  overrides: Partial<Evaluation> = {},
): Evaluation {
  counter += 1;
  return {
    id: `e${counter}`,
    playerId,
    evaluatedAt,
    evaluator: 'Treinador Teste',
    note: '',
    attributes,
    createdAt: `${evaluatedAt}T12:00:00.000Z`,
    demo: false,
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  counter += 1;
  return {
    id: `m${counter}`,
    opponent: `Adversário ${counter}`,
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
  };
}

/** Formação inicial padrão: os seis primeiros ids, um por posição (P1 a P6), com papéis variados. */
export function makeStarters(playerIds: readonly string[]): SetStarter[] {
  const roles = ['levantador', 'oposto', 'ponteiro', 'central', 'ponteiro', 'central'] as const;
  return playerIds.slice(0, 6).map((playerId, slot) => ({ slot, playerId, role: roles[slot] ?? 'ponteiro' }));
}

export function makeMatchSet(matchId: string, number: number, playerIds: readonly string[], overrides: Partial<MatchSet> = {}): MatchSet {
  return {
    matchId,
    number,
    firstServer: 'us',
    starters: makeStarters(playerIds),
    liberoId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeRally(matchId: string, setNumber: number, seq: number, overrides: Partial<Rally> = {}): Rally {
  counter += 1;
  return {
    id: `r${counter}`,
    matchId,
    setNumber,
    seq,
    servingSide: 'us',
    winnerSide: 'us',
    rotation: 0,
    serverPlayerId: null,
    reason: null,
    playerId: null,
    attemptKey: `rk${counter}`,
    recordedAt: `2026-10-01T10:${String(counter % 60).padStart(2, '0')}:00.000Z`,
    voidedAt: null,
    ...overrides,
  };
}

export function makeRallyAction(
  matchId: string,
  rallyId: string,
  playerId: string,
  fundamental: Fundamental,
  outcome: string,
  overrides: Partial<Pick<RallyAction, 'id' | 'recordedAt' | 'attemptKey' | 'voidedAt'>> = {},
): RallyAction {
  counter += 1;
  const result = toFundamentalResult(fundamental, outcome);
  if (!result) throw new Error(`Resultado inválido na fábrica: ${fundamental}/${outcome}`);
  return {
    ...result,
    id: `ra${counter}`,
    matchId,
    rallyId,
    playerId,
    attemptKey: `rak${counter}`,
    recordedAt: `2026-10-01T10:${String(counter % 60).padStart(2, '0')}:00.000Z`,
    voidedAt: null,
    ...overrides,
  };
}
