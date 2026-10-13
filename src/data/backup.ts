import { ATTRIBUTE_KEYS, validateAttributes } from '@/domain/attributes';
import { isFundamental, toFundamentalResult } from '@/domain/fundamentals';
import {
  MATCH_STATUSES,
  RALLY_REASONS,
  SIDES,
  matchState,
  nextContext,
  reasonProblem,
  validateFormat,
  type Match,
  type MatchSet,
  type Rally,
  type RallyAction,
} from '@/domain/match';
import { COURT_SLOTS, FORMATIONS, type Formation, type Lineup, type LineupStarter } from '@/domain/lineup';
import { MAX_WEIGHT, validatePositionWeights, type OverallWeights } from '@/domain/overall';
import { PLAYER_STATUSES, UNIFORM_COLORS, type Evaluation, type Player } from '@/domain/player';
import { isDataUrl } from '@/domain/photo';
import { isCourtRole, isPosition, POSITIONS } from '@/domain/positions';
import {
  TRAINING_STATUSES,
  isRealDate,
  type Training,
  type TrainingEvent,
  type TrainingExercise,
} from '@/domain/training';
import { sha256Hex } from './sha256';
import type { ActivitySnapshot, Workspace } from './types';

/**
 * Backup do workspace inteiro em JSON.
 *
 * Princípios:
 * - O backup contém TODAS as entidades persistidas (nunca só o que está visível) e nenhum segredo.
 * - Importar é "parse, don't validate": o arquivo é tratado como entrada NÃO confiável. Nada é
 *   copiado como veio; cada campo é lido, checado (tipo, faixa, formato) e reconstruído num objeto novo.
 *   Campos desconhecidos são descartados (com aviso), nunca repassados ao workspace.
 * - Vínculos são conferidos (atleta de uma avaliação existe, exercício pertence ao treino, etc.).
 * - O hash SHA-256 detecta arquivo truncado ou alterado por acidente (não é proteção contra má-fé).
 * Compatibilidade entre versões: docs/DATA_SAFETY.md.
 */

export const BACKUP_FORMAT = 'alpha7-backup';
/** Versão do FORMATO DO ARQUIVO (diferente da versão do aplicativo e do esquema de armazenamento). */
export const BACKUP_FORMAT_VERSION = 1;
export const WORKSPACE_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export const MAX_RECORDS = 200_000;
/** Teto para textos livres (os formulários limitam bem abaixo; isto só barra abuso). */
const MAX_TEXT = 5_000;
const MAX_ISSUES_LISTED = 25;

/* ─────────────── resumo ─────────────── */

export interface WorkspaceSummary {
  players: number;
  evaluations: number;
  lineups: number;
  trainings: number;
  exercises: number;
  /** Registros de treino válidos (não anulados). */
  trainingEvents: number;
  /** Registros desfeitos (anulados), preservados no histórico. */
  trainingEventsVoided: number;
  /** Partidas, pontos válidos de partida (não anulados) e ações técnicas válidas de partida. */
  matches: number;
  rallies: number;
  rallyActions: number;
  /** Quantidade de registros marcados como demonstração, em todas as coleções. */
  demoRecords: number;
  /** Quantidade de registros criados pela equipe (não demonstração). */
  realRecords: number;
}

export function summarizeWorkspace(ws: Workspace): WorkspaceSummary {
  const flags = [
    ...ws.players,
    ...ws.evaluations,
    ...ws.lineups,
    ...ws.trainings,
    ...ws.trainingEvents,
  ].map((r) => r.demo);
  const voided = ws.trainingEvents.filter((e) => e.voidedAt !== null).length;
  return {
    players: ws.players.length,
    evaluations: ws.evaluations.length,
    lineups: ws.lineups.length,
    trainings: ws.trainings.length,
    exercises: ws.exercises.length,
    trainingEvents: ws.trainingEvents.length - voided,
    trainingEventsVoided: voided,
    matches: ws.matches.length,
    rallies: ws.rallies.filter((r) => r.voidedAt === null).length,
    rallyActions: ws.rallyActions.filter((a) => a.voidedAt === null).length,
    demoRecords: flags.filter(Boolean).length,
    // Partidas só existem se a equipe as criou: nunca há partida de demonstração.
    realRecords: flags.filter((d) => !d).length + ws.matches.length,
  };
}

export const hasRealData = (ws: Workspace): boolean => summarizeWorkspace(ws).realRecords > 0;

/* ─────────────── hash e canonicalização ─────────────── */

/** JSON com chaves em ordem alfabética e sem `undefined`: mesma entrada, mesmo texto, sempre. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Impressão digital do conteúdo do workspace, para saber se algo mudou desde o último backup.
 * Usa a forma NORMALIZADA (a mesma que vai para o arquivo), então campos extras de dados antigos
 * não geram falsa diferença. Se o workspace não validar, usa o conteúdo como está.
 */
export function workspaceFingerprint(ws: Workspace): string {
  const checked = validateWorkspace(JSON.parse(JSON.stringify(ws)) as unknown);
  return sha256Hex(canonicalize(workspaceBody(checked.ok ? checked.workspace : ws)));
}

/** Apenas as coleções persistidas, na forma que vai para o arquivo. */
function workspaceBody(ws: Workspace) {
  // As coleções de partidas entram só quando há partidas: assim, dados e backups anteriores (sem partidas) mantêm
  // exatamente o mesmo conteúdo, checksum e impressão digital. Mudança ADITIVA do formato (docs/DATA_SAFETY.md).
  const matchData =
    ws.matches.length > 0
      ? { matches: ws.matches, matchSets: ws.matchSets, rallies: ws.rallies, rallyActions: ws.rallyActions }
      : {};
  return {
    ...matchData,
    players: ws.players,
    evaluations: ws.evaluations,
    lineups: ws.lineups,
    settings: ws.settings,
    activity: ws.activity,
    trainings: ws.trainings,
    exercises: ws.exercises,
    trainingEvents: ws.trainingEvents,
  };
}

/* ─────────────── validação estrita ─────────────── */

export type WorkspaceValidation =
  | { ok: true; workspace: Workspace; warnings: string[] }
  | { ok: false; errors: string[]; totalErrors: number };

class Issues {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];
  private total = 0;
  private readonly unknown = new Map<string, Set<string>>();

  error(message: string) {
    this.total += 1;
    if (this.errors.length < MAX_ISSUES_LISTED) this.errors.push(message);
  }
  get totalErrors() {
    return this.total;
  }
  noteUnknown(where: string, keys: string[]) {
    if (keys.length === 0) return;
    const set = this.unknown.get(where) ?? new Set<string>();
    keys.forEach((k) => set.add(k));
    this.unknown.set(where, set);
  }
  finish(): string[] {
    const extra = [...this.unknown.entries()].map(
      ([where, keys]) => `Campos desconhecidos em ${where} foram ignorados: ${[...keys].slice(0, 6).join(', ')}.`,
    );
    return [...this.warnings, ...extra];
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const isIsoDateTime = (v: unknown): v is string => typeof v === 'string' && ISO_DATE_TIME.test(v) && !Number.isNaN(Date.parse(v));

/** Leitores de campo: cada um registra o erro com o contexto (ex.: "Atleta 3 (id x), campo nome"). */
function reader(rec: Rec, where: string, issues: Issues, known: readonly string[]) {
  issues.noteUnknown(
    where.replace(/ \d+.*$/, '').replace(/\(.*\)/, '').trim() || where,
    Object.keys(rec).filter((k) => !known.includes(k)),
  );
  const fail = (field: string, message: string) => issues.error(`${where}, campo "${field}": ${message}`);
  return {
    fail,
    text(field: string, { min = 0, max = MAX_TEXT, trimmed = false } = {}): string | undefined {
      const v = rec[field];
      if (typeof v !== 'string') return void fail(field, 'deve ser texto.');
      const n = trimmed ? v.trim().length : v.length;
      if (n < min) return void fail(field, `deve ter pelo menos ${min} caracteres.`);
      if (v.length > max) return void fail(field, `deve ter no máximo ${max} caracteres.`);
      return v;
    },
    id(field = 'id'): string | undefined {
      return this.text(field, { min: 1, max: 200, trimmed: true });
    },
    bool(field: string): boolean | undefined {
      const v = rec[field];
      if (typeof v !== 'boolean') return void fail(field, 'deve ser verdadeiro ou falso.');
      return v;
    },
    int(field: string, min: number, max: number): number | undefined {
      const v = rec[field];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
        return void fail(field, `deve ser um inteiro de ${min} a ${max}.`);
      }
      return v;
    },
    iso(field: string): string | undefined {
      const v = rec[field];
      if (!isIsoDateTime(v)) return void fail(field, 'deve ser data e hora ISO 8601 (ex.: 2026-10-12T19:30:00.000Z).');
      return v;
    },
    isoOrNull(field: string): string | null | undefined {
      return rec[field] === null ? null : this.iso(field);
    },
    day(field: string): string | undefined {
      const v = rec[field];
      if (typeof v !== 'string' || !isRealDate(v)) return void fail(field, 'deve ser uma data AAAA-MM-DD válida.');
      return v;
    },
    oneOf<T extends string>(field: string, allowed: readonly T[]): T | undefined {
      const v = rec[field];
      if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
        return void fail(field, `valor inválido (esperado: ${allowed.join(', ')}).`);
      }
      return v as T;
    },
  };
}

function listOf(raw: unknown, name: string, issues: Issues): Rec[] {
  if (!Array.isArray(raw)) {
    issues.error(`"${name}" deve ser uma lista.`);
    return [];
  }
  const out: Rec[] = [];
  raw.forEach((item, index) => {
    if (isRec(item)) out.push(item);
    else issues.error(`${name} ${index + 1}: deve ser um objeto.`);
  });
  return out;
}

/**
 * Valida o workspace de forma estrita e devolve uma CÓPIA NORMALIZADA (nunca o objeto recebido).
 * Serve tanto para importar um backup quanto para auditar os dados atuais.
 */
export function validateWorkspace(raw: unknown): WorkspaceValidation {
  const issues = new Issues();
  if (!isRec(raw)) {
    issues.error('O conteúdo do workspace deve ser um objeto.');
    return { ok: false, errors: issues.errors, totalErrors: issues.totalErrors };
  }

  const sizes = ['players', 'evaluations', 'lineups', 'trainings', 'exercises', 'trainingEvents', 'matches', 'matchSets', 'rallies', 'rallyActions'].map((k) =>
    Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0,
  );
  if (sizes.reduce((a, b) => a + b, 0) > MAX_RECORDS) {
    issues.error(`O arquivo tem registros demais (limite de ${MAX_RECORDS}).`);
    return { ok: false, errors: issues.errors, totalErrors: issues.totalErrors };
  }

  const ids = (label: string) => {
    const seen = new Set<string>();
    return (id: string | undefined, where: string) => {
      if (id === undefined) return;
      if (seen.has(id)) issues.error(`${where}: o id "${id}" aparece repetido em ${label}.`);
      seen.add(id);
    };
  };

  /* Atletas */
  const players: Player[] = [];
  const noteAtleta = ids('atletas');
  const jerseys = new Map<number, string>();
  listOf(raw.players, 'players', issues).forEach((rec, i) => {
    const where = `Atleta ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'name', 'jerseyNumber', 'primaryPosition', 'secondaryPosition', 'status', 'uniform', 'coachNotes', 'createdAt', 'updatedAt', 'demo', 'photo']);
    const id = r.id();
    noteAtleta(id, where);
    const name = r.text('name', { min: 2, max: 200, trimmed: true });
    const jerseyNumber = r.int('jerseyNumber', 1, 99);
    const primaryPosition = r.oneOf('primaryPosition', POSITIONS);
    const secondaryRaw = rec.secondaryPosition;
    let secondaryPosition: Player['secondaryPosition'] | undefined;
    if (secondaryRaw === null) secondaryPosition = null;
    else if (isPosition(secondaryRaw)) secondaryPosition = secondaryRaw;
    else r.fail('secondaryPosition', 'deve ser uma posição válida ou nulo.');
    if (secondaryPosition && secondaryPosition === primaryPosition) r.fail('secondaryPosition', 'não pode ser igual à posição principal.');
    const status = r.oneOf('status', PLAYER_STATUSES);
    const uniform = r.oneOf('uniform', UNIFORM_COLORS);
    const coachNotes = r.text('coachNotes');
    const createdAt = r.iso('createdAt');
    const updatedAt = r.iso('updatedAt');
    const demo = r.bool('demo');
    // Foto opcional: imagem em data URL (modo local) ou caminho do arquivo da equipe (nuvem). Nada além disso entra.
    let photo: string | undefined;
    if (rec.photo !== undefined) {
      const value = rec.photo;
      if (typeof value === 'string' && value.length <= 420_000 && (isDataUrl(value) || /^[0-9a-f-]{36}\/[A-Za-z0-9_.-]{1,120}$/.test(value))) photo = value;
      else r.fail('photo', 'deve ser uma imagem (JPEG, PNG ou WebP) em data URL, um caminho de foto da equipe ou ficar ausente.');
    }
    if (jerseyNumber !== undefined) {
      const holder = jerseys.get(jerseyNumber);
      if (holder !== undefined) issues.error(`${where}: o número de camisa ${jerseyNumber} também é usado pelo atleta "${holder}".`);
      jerseys.set(jerseyNumber, id ?? where);
    }
    if (id !== undefined && name !== undefined && jerseyNumber !== undefined && primaryPosition && secondaryPosition !== undefined && status && uniform && coachNotes !== undefined && createdAt && updatedAt && demo !== undefined) {
      players.push({ id, name, jerseyNumber, primaryPosition, secondaryPosition, status, uniform, coachNotes, createdAt, updatedAt, demo, ...(photo ? { photo } : {}) });
    }
  });
  const playerIds = new Set(players.map((p) => p.id));

  /* Avaliações */
  const evaluations: Evaluation[] = [];
  const noteAvaliacao = ids('avaliações');
  listOf(raw.evaluations, 'evaluations', issues).forEach((rec, i) => {
    const where = `Avaliação ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'playerId', 'evaluatedAt', 'evaluator', 'note', 'attributes', 'createdAt', 'demo']);
    const id = r.id();
    noteAvaliacao(id, where);
    const playerId = r.id('playerId');
    if (playerId !== undefined && !playerIds.has(playerId)) r.fail('playerId', `o atleta "${playerId}" não existe no backup.`);
    const evaluatedAt = r.day('evaluatedAt');
    const evaluator = r.text('evaluator', { min: 1, max: 200, trimmed: true });
    const note = r.text('note');
    const createdAt = r.iso('createdAt');
    const demo = r.bool('demo');
    let attributes: Evaluation['attributes'] | undefined;
    if (!isRec(rec.attributes)) r.fail('attributes', 'deve ser um objeto com os nove atributos.');
    else {
      issues.noteUnknown('avaliações (atributos)', Object.keys(rec.attributes).filter((k) => !(ATTRIBUTE_KEYS as readonly string[]).includes(k)));
      const checked = validateAttributes(rec.attributes as Record<string, unknown>);
      if (!checked.ok) Object.values(checked.errors).forEach((m) => issues.error(`${where}: ${m}`));
      else attributes = checked.value;
    }
    if (id !== undefined && playerId !== undefined && playerIds.has(playerId) && evaluatedAt && evaluator !== undefined && note !== undefined && attributes && createdAt && demo !== undefined) {
      evaluations.push({ id, playerId, evaluatedAt, evaluator, note, attributes, createdAt, demo });
    }
  });

  /* Escalações */
  const lineups: Lineup[] = [];
  const noteEscalacao = ids('escalações');
  listOf(raw.lineups, 'lineups', issues).forEach((rec, i) => {
    const where = `Escalação ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'title', 'opponent', 'competition', 'scheduledAt', 'venue', 'formation', 'starters', 'liberoId', 'benchIds', 'createdAt', 'updatedAt', 'demo']);
    const id = r.id();
    noteEscalacao(id, where);
    const title = r.text('title', { max: 500 });
    const opponent = r.text('opponent');
    const competition = r.text('competition');
    const scheduledAt = r.text('scheduledAt', { max: 100 });
    const venue = r.text('venue');
    const formation = r.oneOf<Formation>('formation', FORMATIONS);
    const createdAt = r.iso('createdAt');
    const updatedAt = r.iso('updatedAt');
    const demo = r.bool('demo');
    const used = new Set<string>();
    const claim = (playerId: string, field: string) => {
      if (!playerIds.has(playerId)) r.fail(field, `o atleta "${playerId}" não existe no backup.`);
      else if (used.has(playerId)) r.fail(field, `o atleta "${playerId}" aparece mais de uma vez na escalação.`);
      used.add(playerId);
    };
    let starters: (LineupStarter | null)[] | undefined;
    if (!Array.isArray(rec.starters) || rec.starters.length !== COURT_SLOTS.length) {
      r.fail('starters', `deve ser uma lista de ${COURT_SLOTS.length} posições (cada uma pode ser nula).`);
    } else {
      const parsed: (LineupStarter | null)[] = [];
      let startersOk = true;
      rec.starters.forEach((s: unknown, slot: number) => {
        if (s === null) return void parsed.push(null);
        if (!isRec(s) || typeof s.playerId !== 'string' || !isCourtRole(s.role)) {
          r.fail('starters', `a posição P${slot + 1} deve ser nula ou ter playerId e role (levantador, oposto, ponteiro ou central).`);
          startersOk = false;
          return;
        }
        claim(s.playerId, `starters P${slot + 1}`);
        parsed.push({ playerId: s.playerId, role: s.role });
      });
      if (startersOk) starters = parsed;
    }
    let liberoId: string | null | undefined;
    if (rec.liberoId === null) liberoId = null;
    else if (typeof rec.liberoId === 'string') {
      liberoId = rec.liberoId;
      claim(rec.liberoId, 'liberoId');
    } else r.fail('liberoId', 'deve ser o id de um atleta ou nulo.');
    let benchIds: string[] | undefined;
    if (!Array.isArray(rec.benchIds) || !rec.benchIds.every((b: unknown) => typeof b === 'string')) {
      r.fail('benchIds', 'deve ser uma lista de ids de atletas.');
    } else {
      benchIds = [...(rec.benchIds as string[])];
      benchIds.forEach((b) => claim(b, 'benchIds'));
    }
    if (id !== undefined && title !== undefined && opponent !== undefined && competition !== undefined && scheduledAt !== undefined && venue !== undefined && formation && starters && liberoId !== undefined && benchIds && createdAt && updatedAt && demo !== undefined) {
      lineups.push({ id, title, opponent, competition, scheduledAt, venue, formation, starters, liberoId, benchIds, createdAt, updatedAt, demo });
    }
  });

  /* Configurações */
  let settings: Workspace['settings'] | undefined;
  if (!isRec(raw.settings) || !isRec(raw.settings.weights)) {
    issues.error('Configurações: faltam os pesos do Overall ("settings.weights").');
  } else {
    issues.noteUnknown('configurações', Object.keys(raw.settings).filter((k) => k !== 'weights'));
    const weights = {} as OverallWeights;
    let ok = true;
    for (const position of POSITIONS) {
      const candidate = raw.settings.weights[position];
      if (!isRec(candidate)) {
        issues.error(`Configurações: faltam os pesos de "${position}".`);
        ok = false;
        continue;
      }
      const row = {} as OverallWeights[typeof position];
      for (const key of ATTRIBUTE_KEYS) {
        const v = candidate[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_WEIGHT) {
          issues.error(`Configurações, pesos de "${position}", ${key}: deve ser um número de 0 a ${MAX_WEIGHT}.`);
          ok = false;
        } else row[key] = v;
      }
      if (ok) {
        const problem = validatePositionWeights(row);
        if (problem) {
          issues.error(`Configurações, pesos de "${position}": ${problem}`);
          ok = false;
        }
      }
      weights[position] = row;
    }
    if (ok) settings = { weights };
  }

  /* Atividade de demonstração */
  let activity: ActivitySnapshot | null | undefined;
  if (raw.activity === null) activity = null;
  else if (isRec(raw.activity)) {
    const a = raw.activity;
    const m = a.matches;
    const next = a.nextMatch;
    const nextOk =
      next === null ||
      (isRec(next) && ['opponent', 'competition', 'scheduledAt', 'venue'].every((k) => typeof next[k] === 'string'));
    if (
      a.demo === true &&
      isRec(m) &&
      Number.isInteger(m.played) && (m.played as number) >= 0 &&
      Number.isInteger(m.wins) && (m.wins as number) >= 0 && (m.wins as number) <= (m.played as number) &&
      nextOk
    ) {
      activity = {
        demo: true,
        matches: { played: m.played as number, wins: m.wins as number },
        nextMatch: next === null ? null : { opponent: next.opponent as string, competition: next.competition as string, scheduledAt: next.scheduledAt as string, venue: next.venue as string },
      };
    } else issues.error('Atividade ("activity"): formato inválido.');
  } else issues.error('Atividade ("activity"): deve ser nula ou um objeto.');

  /* Treinos */
  const trainings: Training[] = [];
  const noteTreino = ids('treinos');
  listOf(raw.trainings, 'trainings', issues).forEach((rec, i) => {
    const where = `Treino ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'name', 'date', 'durationMinutes', 'description', 'notes', 'responsible', 'participantIds', 'status', 'completedAt', 'createdAt', 'updatedAt', 'demo']);
    const id = r.id();
    noteTreino(id, where);
    const name = r.text('name', { min: 1, max: 500, trimmed: true });
    const date = r.day('date');
    const durationMinutes = rec.durationMinutes === null ? null : r.int('durationMinutes', 1, 1440);
    const description = r.text('description');
    const notes = r.text('notes');
    const responsible = r.text('responsible', { max: 500 });
    const status = r.oneOf('status', TRAINING_STATUSES);
    const completedAt = r.isoOrNull('completedAt');
    const createdAt = r.iso('createdAt');
    const updatedAt = r.iso('updatedAt');
    const demo = r.bool('demo');
    let participantIds: string[] | undefined;
    if (!Array.isArray(rec.participantIds) || !rec.participantIds.every((p: unknown) => typeof p === 'string')) {
      r.fail('participantIds', 'deve ser uma lista de ids de atletas.');
    } else {
      const list = rec.participantIds as string[];
      if (new Set(list).size !== list.length) r.fail('participantIds', 'há participante repetido.');
      list.forEach((p) => {
        if (!playerIds.has(p)) r.fail('participantIds', `o atleta "${p}" não existe no backup.`);
      });
      participantIds = [...list];
    }
    if (id !== undefined && name !== undefined && date && durationMinutes !== undefined && description !== undefined && notes !== undefined && responsible !== undefined && participantIds && status && completedAt !== undefined && createdAt && updatedAt && demo !== undefined) {
      trainings.push({ id, name, date, durationMinutes, description, notes, responsible, participantIds, status, completedAt, createdAt, updatedAt, demo });
    }
  });
  const trainingById = new Map(trainings.map((t) => [t.id, t]));

  /* Exercícios */
  const exercises: TrainingExercise[] = [];
  const noteExercicio = ids('exercícios');
  listOf(raw.exercises, 'exercises', issues).forEach((rec, i) => {
    const where = `Exercício ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'trainingId', 'name', 'focus', 'order', 'createdAt']);
    const id = r.id();
    noteExercicio(id, where);
    const trainingId = r.id('trainingId');
    if (trainingId !== undefined && !trainingById.has(trainingId)) r.fail('trainingId', `o treino "${trainingId}" não existe no backup.`);
    const name = r.text('name', { min: 1, max: 500, trimmed: true });
    let focus: TrainingExercise['focus'] | undefined;
    if (rec.focus === null) focus = null;
    else if (isFundamental(rec.focus)) focus = rec.focus;
    else r.fail('focus', 'deve ser um fundamento válido ou nulo.');
    const order = r.int('order', 0, 10_000);
    const createdAt = r.iso('createdAt');
    if (id !== undefined && trainingId !== undefined && trainingById.has(trainingId) && name !== undefined && focus !== undefined && order !== undefined && createdAt) {
      exercises.push({ id, trainingId, name, focus, order, createdAt });
    }
  });
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  /* Registros de treino */
  const trainingEvents: TrainingEvent[] = [];
  const noteEvento = ids('registros de treino');
  const attemptKeys = new Set<string>();
  listOf(raw.trainingEvents, 'trainingEvents', issues).forEach((rec, i) => {
    const where = `Registro de treino ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'trainingId', 'exerciseId', 'playerId', 'fundamental', 'outcome', 'recordedAt', 'attemptKey', 'voidedAt', 'demo']);
    const id = r.id();
    noteEvento(id, where);
    const trainingId = r.id('trainingId');
    const exerciseId = r.id('exerciseId');
    const playerId = r.id('playerId');
    const attemptKey = r.text('attemptKey', { min: 1, max: 300, trimmed: true });
    const recordedAt = r.iso('recordedAt');
    const voidedAt = r.isoOrNull('voidedAt');
    const demo = r.bool('demo');
    const result = toFundamentalResult(rec.fundamental, rec.outcome);
    if (!result) r.fail('outcome', 'o resultado não é válido para o fundamento informado.');
    const training = trainingId !== undefined ? trainingById.get(trainingId) : undefined;
    if (trainingId !== undefined && !training) r.fail('trainingId', `o treino "${trainingId}" não existe no backup.`);
    if (exerciseId !== undefined) {
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) r.fail('exerciseId', `o exercício "${exerciseId}" não existe no backup.`);
      else if (trainingId !== undefined && exercise.trainingId !== trainingId) {
        r.fail('exerciseId', `o exercício "${exerciseId}" pertence a outro treino.`);
      }
    }
    if (playerId !== undefined) {
      if (!playerIds.has(playerId)) r.fail('playerId', `o atleta "${playerId}" não existe no backup.`);
      else if (training && voidedAt === null && !training.participantIds.includes(playerId)) {
        r.fail('playerId', `o atleta "${playerId}" tem registro válido mas não participa do treino.`);
      }
    }
    if (attemptKey !== undefined) {
      if (attemptKeys.has(attemptKey)) issues.error(`${where}: a chave de tentativa "${attemptKey}" aparece repetida (tentativa duplicada).`);
      attemptKeys.add(attemptKey);
    }
    if (id !== undefined && training && exerciseId !== undefined && exerciseById.get(exerciseId)?.trainingId === trainingId && playerId !== undefined && playerIds.has(playerId) && result && attemptKey !== undefined && recordedAt && voidedAt !== undefined && demo !== undefined) {
      trainingEvents.push({ ...result, id, trainingId: training.id, exerciseId, playerId, recordedAt, attemptKey, voidedAt, demo });
    }
  });

  /* Partidas (coleções opcionais: arquivos anteriores à v0.5 não as têm) */
  const lineupIds = new Set(lineups.map((l) => l.id));
  const matches: Match[] = [];
  const noteMatch = ids('partidas');
  (raw.matches === undefined ? [] : listOf(raw.matches, 'matches', issues)).forEach((rec, i) => {
    const where = `Partida ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'opponent', 'competition', 'scheduledAt', 'venue', 'lineupId', 'format', 'status', 'finalSetsUs', 'finalSetsThem', 'concludedAt', 'createdAt', 'updatedAt']);
    const id = r.id();
    noteMatch(id, where);
    const opponent = r.text('opponent', { min: 2, max: 200, trimmed: true });
    const competition = r.text('competition', { max: 500 });
    const scheduledAt = r.text('scheduledAt', { max: 100 });
    if (scheduledAt !== undefined && scheduledAt !== '' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt)) r.fail('scheduledAt', 'deve ser vazio ou AAAA-MM-DDTHH:mm.');
    const venue = r.text('venue', { max: 500 });
    let lineupId: string | null | undefined;
    if (rec.lineupId === null) lineupId = null;
    else if (typeof rec.lineupId === 'string' && lineupIds.has(rec.lineupId)) lineupId = rec.lineupId;
    else r.fail('lineupId', 'deve ser nulo ou o id de uma escalação existente no backup.');
    let format: Match['format'] | undefined;
    if (!isRec(rec.format)) r.fail('format', 'deve ser um objeto com o formato da partida.');
    else {
      const f = rec.format;
      const candidate = { bestOf: f.bestOf, setPoints: f.setPoints, decidingSetPoints: f.decidingSetPoints, minLead: f.minLead } as Match['format'];
      const problem = validateFormat(candidate);
      if (problem) r.fail('format', problem);
      else format = candidate;
    }
    const status = r.oneOf('status', MATCH_STATUSES);
    const finalSetsUs = rec.finalSetsUs === null ? null : r.int('finalSetsUs', 0, 3);
    const finalSetsThem = rec.finalSetsThem === null ? null : r.int('finalSetsThem', 0, 3);
    const concludedAt = r.isoOrNull('concludedAt');
    const createdAt = r.iso('createdAt');
    const updatedAt = r.iso('updatedAt');
    if (status !== undefined && finalSetsUs !== undefined && finalSetsThem !== undefined && concludedAt !== undefined) {
      if ((finalSetsUs === null) !== (finalSetsThem === null)) r.fail('finalSetsUs', 'o resultado final deve ter os dois lados ou nenhum.');
      if ((status === 'concluida') !== (finalSetsUs !== null && concludedAt !== null)) r.fail('status', 'partida concluída exige resultado e data de conclusão, e o contrário também.');
    }
    if (id !== undefined && opponent !== undefined && competition !== undefined && scheduledAt !== undefined && venue !== undefined && lineupId !== undefined && format && status && finalSetsUs !== undefined && finalSetsThem !== undefined && concludedAt !== undefined && createdAt && updatedAt) {
      matches.push({ id, opponent, competition, scheduledAt, venue, lineupId, format, status, finalSetsUs, finalSetsThem, concludedAt, createdAt, updatedAt });
    }
  });
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const matchSets: MatchSet[] = [];
  (raw.matchSets === undefined ? [] : listOf(raw.matchSets, 'matchSets', issues)).forEach((rec, i) => {
    const where = `Set ${i + 1}`;
    const r = reader(rec, where, issues, ['matchId', 'number', 'firstServer', 'starters', 'liberoId', 'createdAt']);
    const matchId = r.id('matchId');
    const match = matchId !== undefined ? matchById.get(matchId) : undefined;
    if (matchId !== undefined && !match) r.fail('matchId', `a partida "${matchId}" não existe no backup.`);
    const number = r.int('number', 1, 5);
    if (number !== undefined && match && number > match.format.bestOf) r.fail('number', 'o set não cabe no formato da partida.');
    if (number !== undefined && matchId !== undefined && matchSets.some((s) => s.matchId === matchId && s.number === number)) r.fail('number', `o set ${number} aparece repetido na partida.`);
    const firstServer = r.oneOf('firstServer', SIDES);
    const createdAt = r.iso('createdAt');
    let starters: MatchSet['starters'] | undefined;
    if (!Array.isArray(rec.starters) || rec.starters.length !== 6) r.fail('starters', 'deve ter exatamente seis titulares.');
    else {
      const parsed: MatchSet['starters'] = [];
      const used = new Set<string>();
      const slots = new Set<number>();
      let ok = true;
      for (const s of rec.starters as unknown[]) {
        if (!isRec(s) || typeof s.playerId !== 'string' || !Number.isInteger(s.slot) || (s.slot as number) < 0 || (s.slot as number) > 5 || !isCourtRole(s.role)) {
          ok = false;
          continue;
        }
        if (!playerIds.has(s.playerId)) {
          r.fail('starters', `o atleta "${s.playerId}" não existe no backup.`);
          ok = false;
        }
        if (used.has(s.playerId) || slots.has(s.slot as number)) ok = false;
        used.add(s.playerId);
        slots.add(s.slot as number);
        parsed.push({ slot: s.slot as number, playerId: s.playerId, role: s.role });
      }
      if (!ok || parsed.length !== 6) r.fail('starters', 'cada posição de 0 a 5 deve ter um titular válido, sem atleta repetido.');
      else starters = parsed.sort((a, b) => a.slot - b.slot);
    }
    let liberoId: string | null | undefined;
    if (rec.liberoId === null) liberoId = null;
    else if (typeof rec.liberoId === 'string' && playerIds.has(rec.liberoId) && !(starters ?? []).some((s) => s.playerId === rec.liberoId)) liberoId = rec.liberoId;
    else r.fail('liberoId', 'deve ser nulo ou um atleta do backup fora dos seis titulares.');
    if (match && matchId !== undefined && number !== undefined && firstServer && starters && liberoId !== undefined && createdAt) {
      matchSets.push({ matchId, number, firstServer, starters, liberoId, createdAt });
    }
  });
  for (const match of matches) {
    const numbers = matchSets.filter((s) => s.matchId === match.id).map((s) => s.number).sort((a, b) => a - b);
    if (numbers.some((n, index) => n !== index + 1)) issues.error(`Partida "${match.opponent}": os sets devem ser numerados em sequência a partir do 1.`);
  }

  const rallies: Rally[] = [];
  const noteRally = ids('pontos de partida');
  const rallyKeys = new Set<string>();
  (raw.rallies === undefined ? [] : listOf(raw.rallies, 'rallies', issues)).forEach((rec, i) => {
    const where = `Ponto de partida ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'matchId', 'setNumber', 'seq', 'servingSide', 'winnerSide', 'rotation', 'serverPlayerId', 'reason', 'playerId', 'attemptKey', 'recordedAt', 'voidedAt']);
    const id = r.id();
    noteRally(id, where);
    const matchId = r.id('matchId');
    const setNumber = r.int('setNumber', 1, 5);
    const setExists = matchId !== undefined && setNumber !== undefined && matchSets.some((s) => s.matchId === matchId && s.number === setNumber);
    if (matchId !== undefined && setNumber !== undefined && !setExists) r.fail('setNumber', 'o set deste ponto não existe no backup.');
    const seq = r.int('seq', 1, 10_000);
    const servingSide = r.oneOf('servingSide', SIDES);
    const winnerSide = r.oneOf('winnerSide', SIDES);
    const rotation = r.int('rotation', 0, 10_000);
    const attemptKey = r.text('attemptKey', { min: 1, max: 300, trimmed: true });
    const recordedAt = r.iso('recordedAt');
    const voidedAt = r.isoOrNull('voidedAt');
    let serverPlayerId: string | null | undefined;
    if (rec.serverPlayerId === null) serverPlayerId = null;
    else if (typeof rec.serverPlayerId === 'string' && playerIds.has(rec.serverPlayerId)) serverPlayerId = rec.serverPlayerId;
    else r.fail('serverPlayerId', 'deve ser nulo ou um atleta do backup.');
    let playerId: string | null | undefined;
    if (rec.playerId === null) playerId = null;
    else if (typeof rec.playerId === 'string' && playerIds.has(rec.playerId)) playerId = rec.playerId;
    else r.fail('playerId', 'deve ser nulo ou um atleta do backup.');
    let reason: Rally['reason'] | undefined;
    if (rec.reason === null) reason = null;
    else if (typeof rec.reason === 'string' && (RALLY_REASONS as readonly string[]).includes(rec.reason)) reason = rec.reason as Rally['reason'];
    else r.fail('reason', 'motivo desconhecido.');
    if (attemptKey !== undefined) {
      if (rallyKeys.has(attemptKey)) issues.error(`${where}: a chave de tentativa "${attemptKey}" aparece repetida (ponto duplicado).`);
      rallyKeys.add(attemptKey);
    }
    if (servingSide && winnerSide && reason !== undefined) {
      const problem = reasonProblem(reason, winnerSide, servingSide);
      if (problem) r.fail('reason', problem);
    }
    if (id !== undefined && matchId !== undefined && setExists && setNumber !== undefined && seq !== undefined && servingSide && winnerSide && rotation !== undefined && serverPlayerId !== undefined && reason !== undefined && playerId !== undefined && attemptKey !== undefined && recordedAt && voidedAt !== undefined) {
      rallies.push({ id, matchId, setNumber, seq, servingSide, winnerSide, rotation, serverPlayerId, reason, playerId, attemptKey, recordedAt, voidedAt });
    }
  });
  // Coerência do placar: os pontos ATIVOS de cada set seguem a regra de saque e rotação, em sequência, e nenhum
  // vem depois de o set estar encerrado. É o que garante que o placar derivado seja o mesmo em qualquer lugar.
  for (const match of matches) {
    const state = matchState(match, matchSets, rallies);
    for (const set of state.sets) {
      const label = `Partida "${match.opponent}", set ${set.set.number}`;
      const walk = { ...set, rallies: [] as Rally[] };
      let finished = false;
      for (const rally of set.rallies) {
        if (finished) {
          issues.error(`${label}: há ponto registrado depois de o set estar encerrado.`);
          break;
        }
        const context = nextContext(walk);
        if (rally.seq !== context.seq) issues.error(`${label}: a numeração dos pontos deve ser sequencial (esperado ${context.seq}, veio ${rally.seq}).`);
        else if (rally.servingSide !== context.servingSide || rally.rotation !== context.rotation || rally.serverPlayerId !== context.serverPlayerId) {
          issues.error(`${label}, ponto ${rally.seq}: saque, rotação ou sacador não seguem a regra de rodízio.`);
        }
        walk.rallies.push(rally);
        const us = walk.rallies.filter((x) => x.winnerSide === 'us').length;
        const them = walk.rallies.length - us;
        finished = (us >= set.target && us - them >= match.format.minLead) || (them >= set.target && them - us >= match.format.minLead);
      }
    }
    if (match.status === 'concluida' && (match.finalSetsUs !== state.setsUs || match.finalSetsThem !== state.setsThem)) {
      issues.error(`Partida "${match.opponent}": o resultado final (${String(match.finalSetsUs)} x ${String(match.finalSetsThem)}) não confere com os sets (${state.setsUs} x ${state.setsThem}).`);
    }
  }
  const rallyById = new Map(rallies.map((x) => [x.id, x]));

  const rallyActions: RallyAction[] = [];
  const noteAction = ids('ações técnicas de partida');
  const actionKeys = new Set<string>();
  (raw.rallyActions === undefined ? [] : listOf(raw.rallyActions, 'rallyActions', issues)).forEach((rec, i) => {
    const where = `Ação técnica de partida ${i + 1}`;
    const r = reader(rec, where, issues, ['id', 'matchId', 'rallyId', 'playerId', 'fundamental', 'outcome', 'attemptKey', 'recordedAt', 'voidedAt']);
    const id = r.id();
    noteAction(id, where);
    const matchId = r.id('matchId');
    const rallyId = r.id('rallyId');
    const playerId = r.id('playerId');
    const attemptKey = r.text('attemptKey', { min: 1, max: 300, trimmed: true });
    const recordedAt = r.iso('recordedAt');
    const voidedAt = r.isoOrNull('voidedAt');
    const result = toFundamentalResult(rec.fundamental, rec.outcome);
    if (!result) r.fail('outcome', 'o resultado não é válido para o fundamento informado.');
    const rally = rallyId !== undefined ? rallyById.get(rallyId) : undefined;
    if (rallyId !== undefined && !rally) r.fail('rallyId', `o ponto "${rallyId}" não existe no backup.`);
    if (rally && matchId !== undefined && rally.matchId !== matchId) r.fail('matchId', 'a partida da ação não é a do ponto.');
    if (playerId !== undefined && !playerIds.has(playerId)) r.fail('playerId', `o atleta "${playerId}" não existe no backup.`);
    if (attemptKey !== undefined) {
      if (actionKeys.has(attemptKey)) issues.error(`${where}: a chave de tentativa "${attemptKey}" aparece repetida (ação duplicada).`);
      actionKeys.add(attemptKey);
    }
    if (id !== undefined && rally && matchId !== undefined && rally.matchId === matchId && playerId !== undefined && playerIds.has(playerId) && result && attemptKey !== undefined && recordedAt && voidedAt !== undefined) {
      rallyActions.push({ ...result, id, matchId, rallyId: rally.id, playerId, attemptKey, recordedAt, voidedAt });
    }
  });

  if (issues.totalErrors > 0 || !settings || activity === undefined) {
    if (issues.totalErrors === 0) issues.error('Workspace incompleto.');
    return { ok: false, errors: issues.errors, totalErrors: issues.totalErrors };
  }

  return {
    ok: true,
    workspace: { players, evaluations, lineups, settings, activity, trainings, exercises, trainingEvents, matches, matchSets, rallies, rallyActions },
    warnings: issues.finish(),
  };
}

/* ─────────────── arquivo de backup ─────────────── */

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  workspaceSchemaVersion: number;
  exportedAt: string;
  counts: WorkspaceSummary;
  checksum: { algorithm: 'sha256'; value: string };
  workspace: ReturnType<typeof workspaceBody>;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ex.: alpha7-backup-2026-10-13-2105.json (data e hora locais, para não sobrescrever o do mesmo dia). */
export function backupFilename(now: Date): string {
  return `alpha7-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

export type CreateBackupResult =
  | { ok: true; file: BackupFile; json: string; filename: string; summary: WorkspaceSummary }
  | { ok: false; errors: string[]; totalErrors: number };

/**
 * Monta o backup do workspace INTEIRO, depois de validar a estrutura. Se houver problema, não gera
 * arquivo (um backup inconsistente daria falsa sensação de segurança).
 */
export function createBackup(workspace: Workspace, options: { appVersion: string; now?: Date }): CreateBackupResult {
  const now = options.now ?? new Date();
  const checked = validateWorkspace(JSON.parse(JSON.stringify(workspace)) as unknown);
  if (!checked.ok) return { ok: false, errors: checked.errors, totalErrors: checked.totalErrors };
  const normalized = checked.workspace;
  const summary = summarizeWorkspace(normalized);
  const body = workspaceBody(normalized);
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: options.appVersion,
    workspaceSchemaVersion: WORKSPACE_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    counts: summary,
    checksum: { algorithm: 'sha256', value: sha256Hex(canonicalize(body)) },
    workspace: body,
  };
  return { ok: true, file, json: `${JSON.stringify(file, null, 2)}\n`, filename: backupFilename(now), summary };
}

export interface BackupMeta {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
}

export type ParseBackupResult =
  | { ok: true; workspace: Workspace; summary: WorkspaceSummary; meta: BackupMeta; warnings: string[] }
  | { ok: false; errors: string[]; totalErrors: number };

/** Migrações do FORMATO do arquivo: versão N → N+1. Hoje só existe a v1. */
const MIGRATIONS: Record<number, (file: Rec) => Rec> = {};

const fail = (...errors: string[]): ParseBackupResult => ({ ok: false, errors, totalErrors: errors.length });

/**
 * Lê e valida o TEXTO de um arquivo de backup. Nada é gravado: o resultado é só uma proposta de
 * workspace que o chamador decide se aplica. Qualquer problema (formato, versão, hash, tipos,
 * vínculos) rejeita o arquivo inteiro.
 */
export function parseBackup(text: string): ParseBackupResult {
  if (text.length > MAX_BACKUP_BYTES) return fail(`O arquivo é grande demais (limite de ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB).`);
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return fail('O arquivo não é um JSON válido. Escolha um backup exportado pelo Alpha7.');
  }
  if (!isRec(data)) return fail('O arquivo não tem o formato de um backup do Alpha7.');
  if (data.format !== BACKUP_FORMAT) return fail('Este arquivo não é um backup do Alpha7 (identificador de formato ausente ou diferente).');

  const version = data.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('A versão do formato do backup é inválida.');
  }
  if (version > BACKUP_FORMAT_VERSION) {
    return fail(
      `Este backup usa o formato v${version}, mais novo que o suportado por esta versão do Alpha7 (v${BACKUP_FORMAT_VERSION}). Atualize o aplicativo antes de restaurar.`,
    );
  }
  let file: Rec = data;
  for (let v = version; v < BACKUP_FORMAT_VERSION; v += 1) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return fail(`Não há como converter o formato v${v} para o atual. Este backup é incompatível.`);
    file = migrate(file);
  }

  if (typeof file.exportedAt !== 'string' || !isIsoDateTime(file.exportedAt)) return fail('A data de exportação do backup é inválida.');
  if (typeof file.appVersion !== 'string' || file.appVersion.length > 40) return fail('A versão do aplicativo registrada no backup é inválida.');
  if (file.workspaceSchemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    return fail(`O esquema de dados do backup (${String(file.workspaceSchemaVersion)}) não é compatível com esta versão.`);
  }
  const checksum = file.checksum;
  if (!isRec(checksum) || checksum.algorithm !== 'sha256' || typeof checksum.value !== 'string') {
    return fail('O backup não traz a verificação de integridade (checksum).');
  }
  if (!isRec(file.workspace)) return fail('O backup não contém o workspace.');
  if (sha256Hex(canonicalize(file.workspace)) !== checksum.value) {
    return fail('A verificação de integridade falhou: o arquivo foi alterado ou está incompleto/corrompido. Nada foi restaurado.');
  }

  const checked = validateWorkspace(file.workspace);
  if (!checked.ok) return { ok: false, errors: checked.errors, totalErrors: checked.totalErrors };
  return {
    ok: true,
    workspace: checked.workspace,
    summary: summarizeWorkspace(checked.workspace),
    meta: { formatVersion: version, appVersion: file.appVersion, exportedAt: file.exportedAt },
    warnings: checked.warnings,
  };
}
