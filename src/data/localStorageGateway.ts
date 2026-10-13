import { isValidAttributeValue, ATTRIBUTE_KEYS } from '@/domain/attributes';
import { COURT_SLOTS, FORMATIONS, type Lineup } from '@/domain/lineup';
import { cloneWeights, DEFAULT_OVERALL_WEIGHTS, validatePositionWeights, type OverallWeights } from '@/domain/overall';
import { PLAYER_STATUSES, UNIFORM_COLORS, type Evaluation, type Player } from '@/domain/player';
import { isPosition, POSITIONS } from '@/domain/positions';
import { createDemoWorkspace } from './demo';
import { StorageCorruptedError, type DataGateway } from './gateway';
import type { Settings, Workspace } from './types';

export const STORAGE_KEY = 'alpha7.workspace.v1';
export const CORRUPT_BACKUP_KEY = 'alpha7.workspace.v1.corrupt';
const SCHEMA_VERSION = 1;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

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
    activity: isRecord(activity) && activity.demo === true ? (activity as unknown as Workspace['activity']) : null,
  };
}

/**
 * Persistência em localStorage: provisória e local a um navegador. Não é o backend
 * definitivo (veja docs/DATA_MODEL.md). Sem armazenamento disponível, mantém tudo em memória.
 */
export class LocalStorageGateway implements DataGateway {
  readonly persistent: boolean;
  private readonly storage: StorageLike | null;
  private memory: Workspace | null = null;

  constructor(
    storage: StorageLike | null = browserStorage(),
    private readonly createSeed: () => Workspace = () => createDemoWorkspace(),
  ) {
    this.storage = storage;
    this.persistent = storage !== null;
  }

  async load(): Promise<Workspace> {
    if (!this.storage) {
      this.memory ??= this.createSeed();
      return structuredClone(this.memory);
    }
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seed = this.createSeed();
      this.write(seed);
      return seed;
    }
    try {
      return parseWorkspace(raw);
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

  async replaceWorkspace(workspace: Workspace): Promise<void> {
    this.write(workspace);
  }

  private current(): Workspace {
    if (!this.storage) return (this.memory ??= this.createSeed());
    const raw = this.storage.getItem(STORAGE_KEY);
    return raw === null ? this.createSeed() : parseWorkspace(raw);
  }

  private update(mutate: (workspace: Workspace) => void): void {
    const workspace = structuredClone(this.current());
    mutate(workspace);
    this.write(workspace);
  }

  private write(workspace: Workspace): void {
    if (!this.storage) {
      this.memory = structuredClone(workspace);
      return;
    }
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...workspace }));
  }
}
