import { ATTRIBUTE_KEYS, isValidAttributeValue, type AttributeKey, type Attributes } from '@/domain/attributes';
import { isFundamental, toFundamentalResult } from '@/domain/fundamentals';
import { COURT_SLOTS, FORMATIONS, type Lineup, type LineupStarter } from '@/domain/lineup';
import { cloneWeights, DEFAULT_OVERALL_WEIGHTS, validatePositionWeights, type OverallWeights } from '@/domain/overall';
import { PLAYER_STATUSES, UNIFORM_COLORS, type Evaluation, type Player } from '@/domain/player';
import { isCourtRole, isPosition, POSITIONS } from '@/domain/positions';
import { MATCH_STATUSES, RALLY_REASONS, SIDES, type Match, type MatchSet, type Rally, type RallyAction } from '@/domain/match';
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

/* ───────── partidas ───────── */
export type MatchRow = Tables['matches']['Row'];
export type MatchInsertRow = Tables['matches']['Insert'];
export type SetRow = Tables['match_sets']['Row'];
export type SetStarterRow = Tables['match_set_starters']['Row'];
export type RallyRow = Tables['rallies']['Row'];
export type RallyActionRow = Tables['rally_actions']['Row'];

const isFormatSize = (value: number): value is 1 | 3 | 5 => value === 1 || value === 3 || value === 5;

export function matchFromRow(row: MatchRow): Match {
  if (!isFormatSize(row.best_of)) throw new RemoteDataError(`partida ${row.id}: formato de ${row.best_of} sets desconhecido`);
  return {
    id: row.id,
    opponent: row.opponent,
    competition: row.competition,
    scheduledAt: row.scheduled_at,
    venue: row.venue,
    lineupId: row.lineup_id,
    format: { bestOf: row.best_of, setPoints: row.set_points, decidingSetPoints: row.deciding_set_points, minLead: row.min_lead },
    status: oneOf(MATCH_STATUSES, row.status, `partida ${row.id}`),
    finalSetsUs: row.final_sets_us,
    finalSetsThem: row.final_sets_them,
    concludedAt: row.concluded_at === null ? null : toIso(row.concluded_at, `partida ${row.id}`),
    createdAt: toIso(row.created_at, `partida ${row.id}`),
    updatedAt: toIso(row.updated_at, `partida ${row.id}`),
  };
}

/** Só as colunas que o banco deixa gravar direto: status e resultado mudam apenas pelas funções do banco. */
export const matchToInsertRow = (teamId: string, match: Match): MatchInsertRow => ({
  team_id: teamId,
  id: match.id,
  opponent: match.opponent,
  competition: match.competition,
  scheduled_at: match.scheduledAt,
  venue: match.venue,
  lineup_id: match.lineupId,
  best_of: match.format.bestOf,
  set_points: match.format.setPoints,
  deciding_set_points: match.format.decidingSetPoints,
  min_lead: match.format.minLead,
  created_at: match.createdAt,
  updated_at: match.updatedAt,
});

export const matchToUpdateRow = (match: Match) => ({
  opponent: match.opponent,
  competition: match.competition,
  scheduled_at: match.scheduledAt,
  venue: match.venue,
  lineup_id: match.lineupId,
  best_of: match.format.bestOf,
  set_points: match.format.setPoints,
  deciding_set_points: match.format.decidingSetPoints,
  min_lead: match.format.minLead,
  updated_at: match.updatedAt,
});

export function setFromRows(row: SetRow, starterRows: readonly SetStarterRow[]): MatchSet {
  const starters = [...starterRows]
    .sort((a, b) => a.slot - b.slot)
    .map((s) => {
      if (!isCourtRole(s.role)) throw new RemoteDataError(`set ${row.number}: papel "${s.role.slice(0, 30)}" desconhecido`);
      return { slot: s.slot, playerId: s.player_id, role: s.role };
    });
  if (starters.length !== 6) throw new RemoteDataError(`set ${row.number} da partida ${row.match_id}: formação incompleta`);
  return {
    matchId: row.match_id,
    number: row.number,
    firstServer: oneOf(SIDES, row.first_server, `set ${row.number}`),
    starters,
    liberoId: row.libero_id,
    createdAt: toIso(row.created_at, `set ${row.number}`),
  };
}

export function rallyFromRow(row: RallyRow): Rally {
  const reason = row.reason === null ? null : oneOf(RALLY_REASONS, row.reason, `ponto ${row.id}`);
  return {
    id: row.id,
    matchId: row.match_id,
    setNumber: row.set_number,
    seq: row.seq,
    servingSide: oneOf(SIDES, row.serving_side, `ponto ${row.id}`),
    winnerSide: oneOf(SIDES, row.winner_side, `ponto ${row.id}`),
    rotation: row.rotation,
    serverPlayerId: row.server_player_id,
    reason,
    playerId: row.player_id,
    attemptKey: row.attempt_key,
    recordedAt: toIso(row.recorded_at, `ponto ${row.id}`),
    voidedAt: row.voided_at === null ? null : toIso(row.voided_at, `ponto ${row.id}`),
  };
}

export function rallyActionFromRow(row: RallyActionRow): RallyAction {
  const result = toFundamentalResult(row.fundamental, row.outcome);
  if (!result) throw new RemoteDataError(`ação ${row.id}: resultado "${row.outcome.slice(0, 30)}" não vale para ${row.fundamental.slice(0, 30)}`);
  return {
    ...result,
    id: row.id,
    matchId: row.match_id,
    rallyId: row.rally_id,
    playerId: row.player_id,
    attemptKey: row.attempt_key,
    recordedAt: toIso(row.recorded_at, `ação ${row.id}`),
    voidedAt: row.voided_at === null ? null : toIso(row.voided_at, `ação ${row.id}`),
  };
}

/**
 * As funções do banco devolvem a linha como JSON. Confere que é um objeto com as colunas esperadas antes de usá-lo
 * (resposta fora do formato vira RemoteDataError, nunca um valor mal formado dentro do aplicativo).
 */
export function jsonRow<K extends string>(value: unknown, keys: readonly K[], label: string): Record<K, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RemoteDataError(`${label}: resposta inesperada do servidor`);
  const record = value as Record<string, unknown>;
  for (const key of keys) if (!(key in record)) throw new RemoteDataError(`${label}: falta "${key}" na resposta do servidor`);
  return record as Record<K, unknown>;
}
