import { createUniformAttributes, type Attributes } from '@/domain/attributes';
import type { Evaluation, Player } from '@/domain/player';

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
