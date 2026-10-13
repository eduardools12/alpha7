import { createUniformAttributes, type Attributes } from '@/domain/attributes';
import { toFundamentalResult, type Fundamental } from '@/domain/fundamentals';
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
