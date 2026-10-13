import { ATTRIBUTE_KEYS, isValidAttributeValue, type AttributeKey, type Attributes } from '@/domain/attributes';
import { isFundamental, toFundamentalResult } from '@/domain/fundamentals';
import { COURT_SLOTS, FORMATIONS, type Lineup, type LineupStarter } from '@/domain/lineup';
import { cloneWeights, DEFAULT_OVERALL_WEIGHTS, validatePositionWeights, type OverallWeights } from '@/domain/overall';
import { PLAYER_STATUSES, UNIFORM_COLORS, type Evaluation, type Player } from '@/domain/player';
import { isCourtRole, isPosition, POSITIONS } from '@/domain/positions';
import { TRAINING_STATUSES, type Training, type TrainingEvent, type TrainingExercise } from '@/domain/training';
import { RemoteDataError } from '../gateway';
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];
export type PlayerRow = Tables['players']['Row'];
export type EvaluationRow = Tables['evaluations']['Row'];
export type WeightsRow = Tables['overall_weights']['Row'];
export type LineupRow = Tables['lineups']['Row'];
export type StarterRow = Tables['lineup_starters']['Row'];
export type BenchRow = Tables['lineup_bench']['Row'];
export type TrainingRow = Tables['trainings']['Row'];
export type ParticipantRow = Tables['training_participants']['Row'];
export type ExerciseRow = Tables['training_exercises']['Row'];
export type EventRow = Tables['training_events']['Row'];

/** Colunas dos atributos no banco: SAC → sac, REC → rec ... */
const ATTRIBUTE_COLUMN = {
  SAC: 'sac',
  REC: 'rec',
  LEV: 'lev',
  ATA: 'ata',
  BLQ: 'blq',
  DEF: 'def',
  VEL: 'vel',
  IMP: 'imp',
  LEI: 'lei',
} as const satisfies Record<AttributeKey, string>;

/** timestamptz do Postgres ("2026-10-01T12:00:00+00:00") → ISO do aplicativo ("…T12:00:00.000Z"). */
export function toIso(value: string, label: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new RemoteDataError(`${label}: data inválida`);
  return new Date(time).toISOString();
}

function oneOf<T extends string>(allowed: readonly T[], value: string, label: string): T {
  const found = allowed.find((item) => item === value);
  if (found === undefined) throw new RemoteDataError(`${label}: valor "${value.slice(0, 30)}" desconhecido`);
  return found;
}

const requirePosition = (value: string, label: string) => {
  if (!isPosition(value)) throw new RemoteDataError(`${label}: posição "${value.slice(0, 30)}" desconhecida`);
  return value;
};

/* ───────── jogadores ───────── */
export function playerFromRow(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    jerseyNumber: row.jersey_number,
    primaryPosition: requirePosition(row.primary_position, `atleta ${row.id}`),
    secondaryPosition: row.secondary_position === null ? null : requirePosition(row.secondary_position, `atleta ${row.id}`),
    status: oneOf(PLAYER_STATUSES, row.status, `atleta ${row.id}`),
    uniform: oneOf(UNIFORM_COLORS, row.uniform, `atleta ${row.id}`),
    coachNotes: row.coach_notes,
    createdAt: toIso(row.created_at, `atleta ${row.id}`),
    updatedAt: toIso(row.updated_at, `atleta ${row.id}`),
    demo: row.demo,
  };
}

export const playerToRow = (teamId: string, player: Player): PlayerRow => ({
  team_id: teamId,
  id: player.id,
  name: player.name,
  jersey_number: player.jerseyNumber,
  primary_position: player.primaryPosition,
  secondary_position: player.secondaryPosition,
  status: player.status,
  uniform: player.uniform,
  coach_notes: player.coachNotes,
  created_at: player.createdAt,
  updated_at: player.updatedAt,
  demo: player.demo,
});

/* ───────── avaliações ───────── */
export function evaluationFromRow(row: EvaluationRow): Evaluation {
  const attributes = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, Number(row[ATTRIBUTE_COLUMN[key]])]),
  ) as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    if (!isValidAttributeValue(attributes[key])) throw new RemoteDataError(`avaliação ${row.id}: ${key} fora de 1 a 99`);
  }
  return {
    id: row.id,
    playerId: row.player_id,
    evaluatedAt: row.evaluated_at,
    evaluator: row.evaluator,
    note: row.note,
    attributes,
    createdAt: toIso(row.created_at, `avaliação ${row.id}`),
    demo: row.demo,
  };
}

export const evaluationToRow = (teamId: string, evaluation: Evaluation): EvaluationRow => ({
  team_id: teamId,
  id: evaluation.id,
  player_id: evaluation.playerId,
  evaluated_at: evaluation.evaluatedAt,
  evaluator: evaluation.evaluator,
  note: evaluation.note,
  sac: evaluation.attributes.SAC,
  rec: evaluation.attributes.REC,
  lev: evaluation.attributes.LEV,
  ata: evaluation.attributes.ATA,
  blq: evaluation.attributes.BLQ,
  def: evaluation.attributes.DEF,
  vel: evaluation.attributes.VEL,
  imp: evaluation.attributes.IMP,
  lei: evaluation.attributes.LEI,
  created_at: evaluation.createdAt,
  demo: evaluation.demo,
});

/* ───────── pesos do Overall ───────── */
/** Posição sem linha no banco usa os pesos padrão; linha inválida é erro (não troca em silêncio pelo padrão). */
export function weightsFromRows(rows: readonly WeightsRow[]): OverallWeights {
  const weights = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
  for (const row of rows) {
    const position = requirePosition(row.position, 'pesos do Overall');
    const candidate = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, Number(row[ATTRIBUTE_COLUMN[key]])])) as Attributes;
    const problem = validatePositionWeights(candidate);
    if (problem) throw new RemoteDataError(`pesos de ${position}: ${problem}`);
    weights[position] = candidate;
  }
  return weights;
}

export const weightsToRows = (teamId: string, weights: OverallWeights): WeightsRow[] =>
  POSITIONS.map((position) => ({
    team_id: teamId,
    position,
    sac: weights[position].SAC,
    rec: weights[position].REC,
    lev: weights[position].LEV,
    ata: weights[position].ATA,
    blq: weights[position].BLQ,
    def: weights[position].DEF,
    vel: weights[position].VEL,
    imp: weights[position].IMP,
    lei: weights[position].LEI,
  }));

/* ───────── escalações ───────── */
export function lineupFromRows(row: LineupRow, starterRows: readonly StarterRow[], benchRows: readonly BenchRow[]): Lineup {
  const starters: (LineupStarter | null)[] = COURT_SLOTS.map(() => null);
  for (const starter of starterRows) {
    if (starter.slot < 0 || starter.slot >= starters.length) throw new RemoteDataError(`escalação ${row.id}: posição ${starter.slot} inválida`);
    if (!isCourtRole(starter.role)) throw new RemoteDataError(`escalação ${row.id}: papel "${starter.role.slice(0, 30)}" desconhecido`);
    starters[starter.slot] = { playerId: starter.player_id, role: starter.role };
  }
  return {
    id: row.id,
    title: row.title,
    opponent: row.opponent,
    competition: row.competition,
    scheduledAt: row.scheduled_at,
    venue: row.venue,
    formation: oneOf(FORMATIONS, row.formation, `escalação ${row.id}`),
    starters,
    liberoId: row.libero_id,
    benchIds: [...benchRows].sort((a, b) => a.sort_order - b.sort_order).map((b) => b.player_id),
    createdAt: toIso(row.created_at, `escalação ${row.id}`),
    updatedAt: toIso(row.updated_at, `escalação ${row.id}`),
    demo: row.demo,
  };
}

export function lineupToRows(teamId: string, lineup: Lineup): { lineup: LineupRow; starters: StarterRow[]; bench: BenchRow[] } {
  const starters: StarterRow[] = lineup.starters.flatMap((starter, slot) =>
    starter ? [{ team_id: teamId, lineup_id: lineup.id, slot, player_id: starter.playerId, role: starter.role }] : [],
  );
  const bench: BenchRow[] = lineup.benchIds.map((playerId, sortOrder) => ({
    team_id: teamId,
    lineup_id: lineup.id,
    sort_order: sortOrder,
    player_id: playerId,
  }));
  return {
    lineup: {
      team_id: teamId,
      id: lineup.id,
      title: lineup.title,
      opponent: lineup.opponent,
      competition: lineup.competition,
      scheduled_at: lineup.scheduledAt,
      venue: lineup.venue,
      formation: lineup.formation,
      libero_id: lineup.liberoId,
      created_at: lineup.createdAt,
      updated_at: lineup.updatedAt,
      demo: lineup.demo,
    },
    starters,
    bench,
  };
}

/* ───────── treinos ───────── */
export function trainingFromRows(row: TrainingRow, participantIds: readonly string[]): Training {
  return {
    id: row.id,
    name: row.name,
    date: row.held_on,
    durationMinutes: row.duration_minutes,
    description: row.description,
    notes: row.notes,
    responsible: row.responsible,
    participantIds: [...participantIds],
    status: oneOf(TRAINING_STATUSES, row.status, `treino ${row.id}`),
    completedAt: row.completed_at === null ? null : toIso(row.completed_at, `treino ${row.id}`),
    createdAt: toIso(row.created_at, `treino ${row.id}`),
    updatedAt: toIso(row.updated_at, `treino ${row.id}`),
    demo: row.demo,
  };
}

export const trainingToRow = (teamId: string, training: Training): TrainingRow => ({
  team_id: teamId,
  id: training.id,
  name: training.name,
  held_on: training.date,
  duration_minutes: training.durationMinutes,
  description: training.description,
  notes: training.notes,
  responsible: training.responsible,
  status: training.status,
  completed_at: training.completedAt,
  created_at: training.createdAt,
  updated_at: training.updatedAt,
  demo: training.demo,
});

export const participantRows = (teamId: string, training: Training): ParticipantRow[] =>
  [...new Set(training.participantIds)].map((playerId) => ({ team_id: teamId, training_id: training.id, player_id: playerId }));

export function exerciseFromRow(row: ExerciseRow): TrainingExercise {
  if (row.focus !== null && !isFundamental(row.focus)) throw new RemoteDataError(`exercício ${row.id}: fundamento "${row.focus.slice(0, 30)}" desconhecido`);
  return {
    id: row.id,
    trainingId: row.training_id,
    name: row.name,
    focus: row.focus,
    order: row.sort_order,
    createdAt: toIso(row.created_at, `exercício ${row.id}`),
  };
}

export const exerciseToRow = (teamId: string, exercise: TrainingExercise): ExerciseRow => ({
  team_id: teamId,
  id: exercise.id,
  training_id: exercise.trainingId,
  name: exercise.name,
  focus: exercise.focus,
  sort_order: exercise.order,
  created_at: exercise.createdAt,
});

export function eventFromRow(row: EventRow): TrainingEvent {
  const result = toFundamentalResult(row.fundamental, row.outcome);
  if (!result) throw new RemoteDataError(`registro ${row.id}: resultado "${row.outcome.slice(0, 30)}" não vale para ${row.fundamental.slice(0, 30)}`);
  return {
    ...result,
    id: row.id,
    trainingId: row.training_id,
    exerciseId: row.exercise_id,
    playerId: row.player_id,
    recordedAt: toIso(row.recorded_at, `registro ${row.id}`),
    attemptKey: row.attempt_key,
    voidedAt: row.voided_at === null ? null : toIso(row.voided_at, `registro ${row.id}`),
    demo: row.demo,
  };
}

export const eventToRow = (teamId: string, event: TrainingEvent): EventRow => ({
  team_id: teamId,
  id: event.id,
  training_id: event.trainingId,
  exercise_id: event.exerciseId,
  player_id: event.playerId,
  fundamental: event.fundamental,
  outcome: event.outcome,
  recorded_at: event.recordedAt,
  attempt_key: event.attemptKey,
  voided_at: event.voidedAt,
  voided_by: null,
  demo: event.demo,
});
