import { isFundamental, toFundamentalResult, type Fundamental, type FundamentalResult } from './fundamentals';
import type { Player, ValidationResult } from './player';

/**
 * Treinos, exercícios e eventos de treino.
 *
 * Três coleções separadas, ligadas por id:
 *   Training 1 ── N TrainingExercise      (um exercício pertence a exatamente um treino)
 *   Training 1 ── N TrainingEvent         (cada evento aponta para um exercício DESSE treino)
 *
 * Eventos são registros observados (estatística). Nunca alteram os atributos subjetivos do
 * atleta (Evaluation): são mundos separados.
 */

export const TRAINING_STATUSES = ['aberto', 'concluido'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const TRAINING_STATUS_LABEL: Record<TrainingStatus, string> = {
  aberto: 'Em andamento',
  concluido: 'Concluído',
};

export const TRAINING_NAME_MIN = 2;
export const TRAINING_NAME_MAX = 80;
export const DURATION_MIN = 1;
export const DURATION_MAX = 600;
export const DESCRIPTION_MAX = 500;
export const TRAINING_NOTES_MAX = 1000;
export const RESPONSIBLE_MAX = 60;
export const EXERCISE_NAME_MIN = 2;
export const EXERCISE_NAME_MAX = 60;
export const MAX_EXERCISES = 30;

export interface Training {
  id: string;
  name: string;
  /** Data do treino, AAAA-MM-DD. */
  date: string;
  durationMinutes: number | null;
  description: string;
  /** Observações do responsável pelo registro. */
  notes: string;
  /** Quem conduz o registro, quando informado. Texto livre (não há autenticação ainda). */
  responsible: string;
  /** Atletas do elenco que participam. */
  participantIds: string[];
  status: TrainingStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
}

export interface TrainingExercise {
  id: string;
  trainingId: string;
  name: string;
  /** Fundamento em foco (informativo): não restringe o que pode ser registrado. */
  focus: Fundamental | null;
  /** Posição na sequência do treino, a partir de 0. */
  order: number;
  createdAt: string;
}

/**
 * Uma tentativa registrada em treino. Cada toque gera UM evento.
 * - attemptKey: chave de idempotência gerada no toque; a mesma chave nunca gera dois eventos.
 * - voidedAt: "desfazer" anula o evento sem apagá-lo (histórico preservado). Estatísticas
 *   usam somente eventos com voidedAt === null.
 */
export type TrainingEvent = FundamentalResult & {
  id: string;
  trainingId: string;
  exerciseId: string;
  playerId: string;
  /** Instante do registro (ISO 8601 com data e hora). */
  recordedAt: string;
  attemptKey: string;
  voidedAt: string | null;
  demo: boolean;
};

/* ─────────────── formulário ─────────────── */

export interface TrainingFormValues {
  name: string;
  date: string;
  duration: string;
  description: string;
  notes: string;
  responsible: string;
}

export interface ExerciseDraft {
  /** id de um exercício já salvo; null para um novo. */
  id: string | null;
  name: string;
  focus: '' | Fundamental;
}

export interface TrainingDraft {
  name: string;
  date: string;
  durationMinutes: number | null;
  description: string;
  notes: string;
  responsible: string;
  participantIds: string[];
  exercises: { id: string | null; name: string; focus: Fundamental | null }[];
}

export interface TrainingErrors {
  fields: Partial<Record<keyof TrainingFormValues, string>>;
  /** Erro por posição na lista de exercícios. */
  exercises: Record<number, string>;
}

export function trainingToFormValues(training?: Training): TrainingFormValues {
  return {
    name: training?.name ?? '',
    date: training?.date ?? '',
    duration: training?.durationMinutes == null ? '' : String(training.durationMinutes),
    description: training?.description ?? '',
    notes: training?.notes ?? '',
    responsible: training?.responsible ?? '',
  };
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validateTrainingForm(
  values: TrainingFormValues,
  participantIds: readonly string[],
  exercises: readonly ExerciseDraft[],
): ValidationResult<TrainingDraft, TrainingErrors> {
  const errors: TrainingErrors = { fields: {}, exercises: {} };

  const name = values.name.trim().replace(/\s+/g, ' ');
  if (name.length < TRAINING_NAME_MIN) errors.fields.name = `Informe o nome do treino (mínimo ${TRAINING_NAME_MIN} letras).`;
  else if (name.length > TRAINING_NAME_MAX) errors.fields.name = `O nome pode ter até ${TRAINING_NAME_MAX} caracteres.`;

  if (!isRealDate(values.date)) errors.fields.date = 'Informe a data do treino.';

  const durationText = values.duration.trim();
  let durationMinutes: number | null = null;
  if (durationText !== '') {
    const value = Number(durationText);
    if (!/^\d+$/.test(durationText) || value < DURATION_MIN || value > DURATION_MAX) {
      errors.fields.duration = `Use minutos inteiros de ${DURATION_MIN} a ${DURATION_MAX}, ou deixe em branco.`;
    } else {
      durationMinutes = value;
    }
  }

  if (values.description.length > DESCRIPTION_MAX) {
    errors.fields.description = `A descrição pode ter até ${DESCRIPTION_MAX} caracteres.`;
  }
  if (values.notes.length > TRAINING_NOTES_MAX) {
    errors.fields.notes = `As observações podem ter até ${TRAINING_NOTES_MAX} caracteres.`;
  }
  if (values.responsible.trim().length > RESPONSIBLE_MAX) {
    errors.fields.responsible = `O nome do responsável pode ter até ${RESPONSIBLE_MAX} caracteres.`;
  }

  if (exercises.length > MAX_EXERCISES) {
    errors.fields.name ??= `Use no máximo ${MAX_EXERCISES} exercícios por treino.`;
  }
  const seen = new Map<string, number>();
  const cleanExercises = exercises.map((exercise, index) => {
    const exerciseName = exercise.name.trim().replace(/\s+/g, ' ');
    if (exerciseName.length < EXERCISE_NAME_MIN) {
      errors.exercises[index] = `Dê um nome ao exercício (mínimo ${EXERCISE_NAME_MIN} letras).`;
    } else if (exerciseName.length > EXERCISE_NAME_MAX) {
      errors.exercises[index] = `O nome pode ter até ${EXERCISE_NAME_MAX} caracteres.`;
    } else {
      const key = exerciseName.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) errors.exercises[index] = `Já existe um exercício chamado "${exerciseName}" neste treino.`;
      else seen.set(key, index);
    }
    if (exercise.focus !== '' && !isFundamental(exercise.focus)) errors.exercises[index] ??= 'Fundamento em foco inválido.';
    return { id: exercise.id, name: exerciseName, focus: exercise.focus === '' ? null : (exercise.focus as Fundamental) };
  });

  if (Object.keys(errors.fields).length > 0 || Object.keys(errors.exercises).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      date: values.date,
      durationMinutes,
      description: values.description.trim(),
      notes: values.notes.trim(),
      responsible: values.responsible.trim().replace(/\s+/g, ' '),
      participantIds: [...new Set(participantIds)],
      exercises: cleanExercises,
    },
  };
}

/* ─────────────── integridade ─────────────── */

export const validEvents = <E extends { voidedAt: string | null }>(events: readonly E[]): E[] =>
  events.filter((e) => e.voidedAt === null);

export function exerciseEventCount(events: readonly TrainingEvent[], exerciseId: string): number {
  return events.filter((e) => e.exerciseId === exerciseId).length;
}

export function participantEventCount(events: readonly TrainingEvent[], trainingId: string, playerId: string): number {
  return validEvents(events).filter((e) => e.trainingId === trainingId && e.playerId === playerId).length;
}

export interface CascadeCounts {
  exercises: number;
  events: number;
}

/** O que será apagado junto com um treino. */
export function cascadeCounts(
  trainingId: string,
  exercises: readonly TrainingExercise[],
  events: readonly TrainingEvent[],
): CascadeCounts {
  return {
    exercises: exercises.filter((e) => e.trainingId === trainingId).length,
    events: events.filter((e) => e.trainingId === trainingId).length,
  };
}

/**
 * Edições que apagariam dados de desempenho são recusadas: não é possível remover um
 * exercício que tem registros nem um participante que tem registros válidos neste treino.
 * Retorna a primeira mensagem de bloqueio, ou null se a edição é segura.
 */
export function checkTrainingEdit(
  training: Training,
  draft: Pick<TrainingDraft, 'participantIds' | 'exercises'>,
  exercises: readonly TrainingExercise[],
  events: readonly TrainingEvent[],
  players: readonly Player[],
): string | null {
  const keptExercises = new Set(draft.exercises.flatMap((e) => (e.id ? [e.id] : [])));
  for (const exercise of exercises.filter((e) => e.trainingId === training.id)) {
    if (keptExercises.has(exercise.id)) continue;
    const count = exerciseEventCount(events, exercise.id);
    if (count > 0) {
      return `O exercício "${exercise.name}" tem ${count} ${count === 1 ? 'registro' : 'registros'} e não pode ser removido. Renomeie-o ou exclua o treino inteiro.`;
    }
  }
  const kept = new Set(draft.participantIds);
  for (const playerId of training.participantIds) {
    if (kept.has(playerId)) continue;
    const count = participantEventCount(events, training.id, playerId);
    if (count > 0) {
      const name = players.find((p) => p.id === playerId)?.name ?? 'O atleta';
      return `${name} tem ${count} ${count === 1 ? 'registro válido' : 'registros válidos'} neste treino e não pode sair da lista de participantes.`;
    }
  }
  return null;
}

/** Aplica um rascunho validado, preservando id, criação, status e eventos do treino existente. */
export function applyTrainingDraft(
  existing: Training | null,
  draft: TrainingDraft,
  nowIso: string,
  makeId: (prefix: string) => string,
): { training: Training; exercises: TrainingExercise[] } {
  const id = existing?.id ?? makeId('training');
  const training: Training = {
    id,
    name: draft.name,
    date: draft.date,
    durationMinutes: draft.durationMinutes,
    description: draft.description,
    notes: draft.notes,
    responsible: draft.responsible,
    participantIds: draft.participantIds,
    status: existing?.status ?? 'aberto',
    completedAt: existing?.completedAt ?? null,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    demo: existing?.demo ?? false,
  };
  const exercises: TrainingExercise[] = draft.exercises.map((exercise, order) => ({
    id: exercise.id ?? makeId('exercise'),
    trainingId: id,
    name: exercise.name,
    focus: exercise.focus,
    order,
    createdAt: nowIso,
  }));
  return { training, exercises };
}

/* ─────────────── registro de tentativas ─────────────── */

export interface RecordContext {
  trainings: readonly Training[];
  exercises: readonly TrainingExercise[];
  events: readonly TrainingEvent[];
  players: readonly Player[];
}

export interface RecordRequest {
  id: string;
  trainingId: string;
  exerciseId: string;
  playerId: string;
  fundamental: string;
  outcome: string;
  attemptKey: string;
  recordedAt: string;
}

export type RecordOutcome =
  | { ok: true; event: TrainingEvent; duplicate: boolean }
  | { ok: false; reason: string };

/**
 * Cria um evento só se todas as referências existem e são coerentes:
 * treino aberto, exercício DESTE treino, atleta participante, resultado válido para o
 * fundamento. A mesma attemptKey devolve o evento original (idempotência) em vez de duplicar.
 */
export function buildTrainingEvent(request: RecordRequest, context: RecordContext): RecordOutcome {
  if (request.attemptKey.trim() === '') return { ok: false, reason: 'Registro sem chave de tentativa.' };

  const repeated = context.events.find((e) => e.attemptKey === request.attemptKey);
  if (repeated) return { ok: true, event: repeated, duplicate: true };

  const training = context.trainings.find((t) => t.id === request.trainingId);
  if (!training) return { ok: false, reason: 'Este treino não existe mais.' };
  if (training.status !== 'aberto') return { ok: false, reason: 'O treino está concluído. Reabra-o para registrar.' };

  const exercise = context.exercises.find((e) => e.id === request.exerciseId);
  if (!exercise || exercise.trainingId !== training.id) {
    return { ok: false, reason: 'Este exercício não pertence ao treino.' };
  }

  if (!context.players.some((p) => p.id === request.playerId)) {
    return { ok: false, reason: 'Este atleta não existe mais no elenco.' };
  }
  if (!training.participantIds.includes(request.playerId)) {
    return { ok: false, reason: 'Este atleta não participa do treino.' };
  }

  const result = toFundamentalResult(request.fundamental, request.outcome);
  if (!result) return { ok: false, reason: 'Resultado inválido para este fundamento.' };

  return {
    ok: true,
    duplicate: false,
    event: {
      ...result,
      id: request.id,
      trainingId: training.id,
      exerciseId: exercise.id,
      playerId: request.playerId,
      recordedAt: request.recordedAt,
      attemptKey: request.attemptKey,
      voidedAt: null,
      demo: false,
    },
  };
}

/** Eventos do treino em ordem cronológica (empate: ordem de inserção). */
export function eventsOfTraining(events: readonly TrainingEvent[], trainingId: string): TrainingEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.trainingId === trainingId)
    .sort((a, b) => a.event.recordedAt.localeCompare(b.event.recordedAt) || a.index - b.index)
    .map(({ event }) => event);
}

/** Último evento válido (não anulado) do treino, ou null. */
export function lastValidEvent(events: readonly TrainingEvent[], trainingId: string): TrainingEvent | null {
  const own = validEvents(eventsOfTraining(events, trainingId));
  return own[own.length - 1] ?? null;
}

/** Os `count` eventos válidos mais recentes, do mais novo para o mais antigo. */
export function recentValidEvents(events: readonly TrainingEvent[], trainingId: string, count: number): TrainingEvent[] {
  return validEvents(eventsOfTraining(events, trainingId)).slice(-count).reverse();
}
