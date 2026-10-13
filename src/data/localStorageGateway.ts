import { isValidAttributeValue, ATTRIBUTE_KEYS } from '@/domain/attributes';
import { toFundamentalResult } from '@/domain/fundamentals';
import { COURT_SLOTS, FORMATIONS, type Lineup } from '@/domain/lineup';
import { cloneWeights, DEFAULT_OVERALL_WEIGHTS, validatePositionWeights, type OverallWeights } from '@/domain/overall';
import { PLAYER_STATUSES, UNIFORM_COLORS, type Evaluation, type Player } from '@/domain/player';
import { isPosition, POSITIONS } from '@/domain/positions';
import { TRAINING_STATUSES, type Training, type TrainingEvent, type TrainingExercise } from '@/domain/training';
import { summarizeWorkspace } from './backup';
import { LAST_BACKUP_KEY } from './backupMeta';
import {
  IntegrityError,
  StorageCorruptedError,
  WorkspaceMissingError,
  type DataGateway,
  type RawCopy,
  type SnapshotInfo,
  type StorageUsage,
} from './gateway';
import type { ActivitySnapshot, Settings, Workspace } from './types';

export const STORAGE_KEY = 'alpha7.workspace.v1';
export const CORRUPT_BACKUP_KEY = 'alpha7.workspace.v1.corrupt';
/** Cópia automática do conteúdo anterior à última substituição (restaurar demo, apagar tudo, importar). */
export const SNAPSHOT_KEY = 'alpha7.workspace.v1.snapshot';
/**
 * Marca de que este navegador JÁ teve um workspace (gravada junto com a primeira gravação e ao abrir
 * dados existentes). Se a chave principal sumir mas a marca ficar, sabemos que algo se perdeu. Se o
 * navegador apagar TODOS os dados do site, a marca some junto e o caso é indistinguível de primeiro uso.
 */
export const SEEN_KEY = 'alpha7.workspace.v1.seen';
/** Chaves cuja presença indica uso anterior. */
const PRIOR_SESSION_KEYS = [SEEN_KEY, SNAPSHOT_KEY, CORRUPT_BACKUP_KEY, LAST_BACKUP_KEY] as const;

/** Estimativa prudente do limite do localStorage por site (varia por navegador; costuma ser ~5 milhões de caracteres). */
export const STORAGE_LIMIT_CHARS = 5_000_000;

interface StoredSnapshot {
  savedAt: string;
  reason: string;
  previousRaw: string;
}
/**
 * Versão do formato. Campos novos são ADITIVOS: dados salvos antes dos treinos (sem
 * trainings/exercises/trainingEvents) continuam válidos e abrem com essas listas vazias.
 */
const SCHEMA_VERSION = 1;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const NOT_FOUND_MESSAGE =
  'Os dados salvos não foram encontrados neste navegador (apagados ou alterados fora do aplicativo?). Nada foi gravado. Recarregue a página para ver as opções de recuperação.';

function browserStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage;
    const probe = '__alpha7_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null; // modo privado restrito, política do navegador, etc.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

function looksLikePlayer(value: unknown): value is Player {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.jerseyNumber === 'number' &&
    isPosition(value.primaryPosition) &&
    (value.secondaryPosition === null || isPosition(value.secondaryPosition)) &&
    (PLAYER_STATUSES as readonly string[]).includes(value.status as string) &&
    (UNIFORM_COLORS as readonly string[]).includes(value.uniform as string)
  );
}

function looksLikeEvaluation(value: unknown): value is Evaluation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.evaluatedAt === 'string' &&
    isRecord(value.attributes) &&
    ATTRIBUTE_KEYS.every((key) => isValidAttributeValue((value.attributes as Record<string, unknown>)[key]))
  );
}

function looksLikeLineup(value: unknown): value is Lineup {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (FORMATIONS as readonly string[]).includes(value.formation as string) &&
    Array.isArray(value.starters) &&
    value.starters.length === COURT_SLOTS.length &&
    Array.isArray(value.benchIds)
  );
}

function looksLikeTraining(value: unknown): value is Training {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.date) &&
    Array.isArray(value.participantIds) &&
    value.participantIds.every(isString) &&
    (TRAINING_STATUSES as readonly string[]).includes(value.status as string)
  );
}

function looksLikeExercise(value: unknown): value is TrainingExercise {
  return isRecord(value) && isString(value.id) && isString(value.trainingId) && isString(value.name) && typeof value.order === 'number';
}

function looksLikeTrainingEvent(value: unknown): value is TrainingEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.trainingId) &&
    isString(value.exerciseId) &&
    isString(value.playerId) &&
    isString(value.attemptKey) &&
    isString(value.recordedAt) &&
    (value.voidedAt === null || isString(value.voidedAt)) &&
    toFundamentalResult(value.fundamental, value.outcome) !== null
  );
}

function readWeights(value: unknown): OverallWeights {
  if (!isRecord(value)) return cloneWeights(DEFAULT_OVERALL_WEIGHTS);
  const result = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
  for (const position of POSITIONS) {
    const candidate = value[position];
    if (!isRecord(candidate)) continue;
    const merged = { ...result[position], ...candidate } as OverallWeights[typeof position];
    if (validatePositionWeights(merged) === null) result[position] = merged;
  }
  return result;
}

function readActivity(value: unknown): ActivitySnapshot | null {
  if (!isRecord(value) || value.demo !== true || !isRecord(value.matches)) return null;
  const matches = value.matches;
  if (typeof matches.played !== 'number' || typeof matches.wins !== 'number') return null;
  return {
    demo: true,
    matches: { played: matches.played, wins: matches.wins },
    nextMatch: isRecord(value.nextMatch) ? (value.nextMatch as unknown as ActivitySnapshot['nextMatch']) : null,
  };
}

/** Lista que pode faltar em dados antigos (vira vazia), mas se existir deve ser válida. */
function optionalList<T>(value: unknown, guard: (item: unknown) => item is T, label: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(guard)) throw new StorageCorruptedError(label);
  return value;
}

function parseWorkspace(raw: string): Workspace {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new StorageCorruptedError('JSON inválido');
  }
  if (!isRecord(data) || data.version !== SCHEMA_VERSION) throw new StorageCorruptedError('versão desconhecida');
  const { players, evaluations, lineups, settings, activity } = data;
  if (!Array.isArray(players) || !players.every(looksLikePlayer)) throw new StorageCorruptedError('elenco inválido');
  if (!Array.isArray(evaluations) || !evaluations.every(looksLikeEvaluation)) {
    throw new StorageCorruptedError('avaliações inválidas');
  }
  if (!Array.isArray(lineups) || !lineups.every(looksLikeLineup)) throw new StorageCorruptedError('escalações inválidas');

  return {
    players,
    evaluations,
    lineups,
    settings: { weights: readWeights(isRecord(settings) ? settings.weights : undefined) },
    activity: readActivity(activity),
    trainings: optionalList(data.trainings, looksLikeTraining, 'treinos inválidos'),
    exercises: optionalList(data.exercises, looksLikeExercise, 'exercícios inválidos'),
    trainingEvents: optionalList(data.trainingEvents, looksLikeTrainingEvent, 'registros de treino inválidos'),
  };
}

/**
 * Persistência em localStorage: provisória e local a um navegador. Não é o backend
 * definitivo (veja docs/DATA_MODEL.md) e NÃO sincroniza com a nuvem. Sem armazenamento
 * disponível, mantém tudo em memória.
 *
 * Nunca cria dados por conta própria: sem workspace, `load` falha e a interface pergunta o que fazer.
 */
export class LocalStorageGateway implements DataGateway {
  readonly kind = 'local' as const;
  readonly persistent: boolean;
  private readonly storage: StorageLike | null;
  private memory: Workspace | null = null;
  private memorySnapshot: StoredSnapshot | null = null;

  constructor(storage: StorageLike | null = browserStorage()) {
    this.storage = storage;
    this.persistent = storage !== null;
  }

  async load(): Promise<Workspace> {
    if (!this.storage) {
      if (!this.memory) throw new WorkspaceMissingError('first-use');
      return structuredClone(this.memory);
    }
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) throw new WorkspaceMissingError(this.hasPriorSession() ? 'lost' : 'first-use');
    try {
      const workspace = parseWorkspace(raw);
      this.markSeen(); // dados criados antes da marca existir passam a tê-la
      return workspace;
    } catch (error) {
      if (error instanceof StorageCorruptedError) {
        // Guarda uma cópia para recuperação manual antes de qualquer restauração.
        try {
          this.storage.setItem(CORRUPT_BACKUP_KEY, raw);
        } catch {
          /* sem espaço: segue sem backup */
        }
      }
      throw error;
    }
  }

  async savePlayer(player: Player): Promise<void> {
    this.update((ws) => {
      // Camisa única também aqui: outra aba pode ter cadastrado o mesmo número depois que esta tela carregou.
      const holder = ws.players.find((p) => p.jerseyNumber === player.jerseyNumber && p.id !== player.id);
      if (holder) throw new IntegrityError(`O número ${player.jerseyNumber} já está em uso por outro atleta.`);
      const exists = ws.players.some((p) => p.id === player.id);
      ws.players = exists ? ws.players.map((p) => (p.id === player.id ? player : p)) : [...ws.players, player];
    });
  }

  async addEvaluation(evaluation: Evaluation): Promise<void> {
    this.update((ws) => {
      ws.evaluations = [...ws.evaluations, evaluation];
    });
  }

  async saveLineup(lineup: Lineup): Promise<void> {
    this.update((ws) => {
      const exists = ws.lineups.some((l) => l.id === lineup.id);
      ws.lineups = exists ? ws.lineups.map((l) => (l.id === lineup.id ? lineup : l)) : [...ws.lineups, lineup];
    });
  }

  async deleteLineup(lineupId: string): Promise<void> {
    this.update((ws) => {
      ws.lineups = ws.lineups.filter((l) => l.id !== lineupId);
    });
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.update((ws) => {
      ws.settings = settings;
    });
  }

  async replaceWorkspace(workspace: Workspace, reason = 'substituição do workspace'): Promise<void> {
    // 1) copia o que existe hoje; se não der, aborta SEM tocar nos dados atuais
    const previousRaw = this.rawCurrent();
    if (previousRaw !== null) this.saveSnapshot(previousRaw, reason);
    // 2) uma única gravação troca tudo de uma vez (se falhar, o conteúdo anterior continua intacto)
    this.write(workspace);
  }

  async snapshotInfo(): Promise<SnapshotInfo | null> {
    const snapshot = this.readSnapshot();
    if (!snapshot) return null;
    let summary: SnapshotInfo['summary'] = null;
    try {
      summary = summarizeWorkspace(parseWorkspace(snapshot.previousRaw));
    } catch {
      /* conteúdo guardado ilegível: informa só data e motivo */
    }
    return { savedAt: snapshot.savedAt, reason: snapshot.reason, summary };
  }

  async restoreSnapshot(): Promise<void> {
    const snapshot = this.readSnapshot();
    if (!snapshot) throw new IntegrityError('Não há cópia de segurança para restaurar.');
    let restored: Workspace;
    try {
      restored = parseWorkspace(snapshot.previousRaw);
    } catch {
      throw new IntegrityError('A cópia de segurança guardada está ilegível e não pode ser restaurada.');
    }
    const currentRaw = this.rawCurrent();
    if (currentRaw !== null) this.saveSnapshot(currentRaw, 'desfazer a última substituição');
    if (this.storage) {
      this.storage.setItem(STORAGE_KEY, snapshot.previousRaw);
      this.markSeen();
    } else this.memory = restored;
  }

  async exportRaw(): Promise<string | null> {
    return this.rawCurrent();
  }

  async recoveryCopies(): Promise<RawCopy[]> {
    const copies: RawCopy[] = [];
    const current = this.rawCurrent();
    if (current !== null) copies.push({ id: 'current', label: 'Dados salvos neste navegador', text: current });
    const unreadable = this.storage?.getItem(CORRUPT_BACKUP_KEY) ?? null;
    if (unreadable !== null && unreadable !== current) {
      copies.push({ id: 'unreadable', label: 'Cópia do conteúdo que não pôde ser lido', text: unreadable });
    }
    const snapshot = this.readSnapshot();
    if (snapshot) copies.push({ id: 'snapshot', label: `Cópia de segurança automática (${snapshot.reason})`, text: snapshot.previousRaw });
    return copies;
  }

  /** Há sinais de que este navegador já teve um workspace? (Não detecta tudo: ver DATA_SAFETY.md.) */
  private hasPriorSession(): boolean {
    return PRIOR_SESSION_KEYS.some((key) => this.storage?.getItem(key) != null);
  }

  private markSeen(): void {
    try {
      if (this.storage && this.storage.getItem(SEEN_KEY) === null) this.storage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* sem espaço: a marca é um reforço, nunca pode impedir o uso */
    }
  }

  subscribe(listener: () => void): () => void {
    if (!this.storage || typeof window === 'undefined') return () => {};
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  async usage(): Promise<StorageUsage | null> {
    if (!this.storage) return null;
    const size = (key: string) => {
      const value = this.storage?.getItem(key);
      return value == null ? 0 : key.length + value.length; // o navegador conta chave + valor
    };
    const workspaceChars = size(STORAGE_KEY);
    const snapshotChars = size(SNAPSHOT_KEY);
    return {
      usedChars: workspaceChars + snapshotChars + size(CORRUPT_BACKUP_KEY),
      limitChars: STORAGE_LIMIT_CHARS,
      workspaceChars,
      snapshotChars,
    };
  }

  /** Texto bruto do workspace atual (ou, sem armazenamento, a serialização da memória). */
  private rawCurrent(): string | null {
    if (this.storage) return this.storage.getItem(STORAGE_KEY);
    return this.memory ? JSON.stringify({ version: SCHEMA_VERSION, ...this.memory }) : null;
  }

  private saveSnapshot(previousRaw: string, reason: string): void {
    const snapshot: StoredSnapshot = { savedAt: new Date().toISOString(), reason, previousRaw };
    if (!this.storage) {
      this.memorySnapshot = snapshot;
      return;
    }
    try {
      this.storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      throw new IntegrityError(
        'Não foi possível criar a cópia de segurança antes de substituir os dados (o navegador está sem espaço?). Nada foi alterado. Exporte um backup e libere espaço antes de tentar de novo.',
      );
    }
  }

  private readSnapshot(): StoredSnapshot | null {
    if (!this.storage) return this.memorySnapshot;
    const raw = this.storage.getItem(SNAPSHOT_KEY);
    if (raw === null) return null;
    try {
      const data: unknown = JSON.parse(raw);
      if (isRecord(data) && isString(data.savedAt) && isString(data.reason) && isString(data.previousRaw)) {
        return { savedAt: data.savedAt, reason: data.reason, previousRaw: data.previousRaw };
      }
    } catch {
      /* cópia ilegível */
    }
    return null;
  }

  async saveTraining(training: Training, exercises: TrainingExercise[]): Promise<void> {
    this.update((ws) => {
      if (exercises.some((e) => e.trainingId !== training.id)) {
        throw new IntegrityError('Há exercício ligado a outro treino.');
      }
      const keptIds = new Set(exercises.map((e) => e.id));
      const orphaned = ws.trainingEvents.find((e) => e.trainingId === training.id && !keptIds.has(e.exerciseId));
      if (orphaned) throw new IntegrityError('Não é possível remover um exercício que tem registros.');
      const strandedPlayer = ws.trainingEvents.find(
        (e) => e.trainingId === training.id && e.voidedAt === null && !training.participantIds.includes(e.playerId),
      );
      if (strandedPlayer) throw new IntegrityError('Não é possível remover da lista um atleta que tem registros válidos.');

      const exists = ws.trainings.some((t) => t.id === training.id);
      ws.trainings = exists ? ws.trainings.map((t) => (t.id === training.id ? training : t)) : [...ws.trainings, training];
      ws.exercises = [...ws.exercises.filter((e) => e.trainingId !== training.id), ...exercises];
    });
  }

  async deleteTraining(trainingId: string): Promise<void> {
    // Apagar um treino leva junto exercícios e muitos registros: guarda a cópia de segurança antes.
    const previousRaw = this.rawCurrent();
    const target = this.current().trainings.find((t) => t.id === trainingId);
    if (previousRaw !== null && target) this.saveSnapshot(previousRaw, `exclusão do treino "${target.name}"`);
    this.update((ws) => {
      ws.trainings = ws.trainings.filter((t) => t.id !== trainingId);
      ws.exercises = ws.exercises.filter((e) => e.trainingId !== trainingId);
      ws.trainingEvents = ws.trainingEvents.filter((e) => e.trainingId !== trainingId);
    });
  }

  async addTrainingEvent(event: TrainingEvent): Promise<void> {
    this.update((ws) => {
      if (ws.trainingEvents.some((e) => e.attemptKey === event.attemptKey)) return false; // idempotente
      const training = ws.trainings.find((t) => t.id === event.trainingId);
      if (!training) throw new IntegrityError('O treino deste registro não existe.');
      const exercise = ws.exercises.find((e) => e.id === event.exerciseId);
      if (!exercise || exercise.trainingId !== training.id) {
        throw new IntegrityError('O exercício deste registro não pertence ao treino.');
      }
      if (!ws.players.some((p) => p.id === event.playerId)) throw new IntegrityError('O atleta deste registro não existe.');
      if (!training.participantIds.includes(event.playerId)) {
        throw new IntegrityError('O atleta deste registro não participa do treino.');
      }
      ws.trainingEvents = [...ws.trainingEvents, event];
      return true;
    });
  }

  async voidTrainingEvent(eventId: string, voidedAt: string): Promise<void> {
    this.update((ws) => {
      const target = ws.trainingEvents.find((e) => e.id === eventId);
      if (!target) throw new IntegrityError('O registro a desfazer não existe.');
      if (target.voidedAt !== null) return false; // já desfeito
      ws.trainingEvents = ws.trainingEvents.map((e) => (e.id === eventId ? { ...e, voidedAt } : e));
      return true;
    });
  }

  private current(): Workspace {
    if (!this.storage) {
      if (!this.memory) throw new IntegrityError(NOT_FOUND_MESSAGE);
      return this.memory;
    }
    const raw = this.storage.getItem(STORAGE_KEY);
    // Nunca recria dados: se o workspace sumiu (outra aba, limpeza do navegador), a gravação é recusada.
    if (raw === null) throw new IntegrityError(NOT_FOUND_MESSAGE);
    return parseWorkspace(raw);
  }

  /** `mutate` pode devolver false para indicar "nada mudou" e evitar uma gravação inútil. */
  private update(mutate: (workspace: Workspace) => void | boolean): void {
    const workspace = structuredClone(this.current());
    if (mutate(workspace) === false) return;
    this.write(workspace);
  }

  private write(workspace: Workspace): void {
    if (!this.storage) {
      this.memory = structuredClone(workspace);
      return;
    }
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...workspace }));
    this.markSeen();
  }
}
