import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { newId } from '@/domain/id';
import type { Lineup } from '@/domain/lineup';
import type { OverallWeights } from '@/domain/overall';
import type { Evaluation, Player, PlayerDraft } from '@/domain/player';
import type { Attributes } from '@/domain/attributes';
import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import { StorageCorruptedError, type DataGateway } from './gateway';
import { LocalStorageGateway } from './localStorageGateway';
import type { Workspace } from './types';

export type WorkspaceStatus = 'loading' | 'ready' | 'error';

export interface EvaluationInput {
  evaluatedAt: string;
  evaluator: string;
  note: string;
  attributes: Attributes;
}

export interface WorkspaceActions {
  createPlayer(draft: PlayerDraft, firstEvaluation?: EvaluationInput): Promise<Player>;
  updatePlayer(id: string, draft: PlayerDraft): Promise<Player>;
  addEvaluation(playerId: string, input: EvaluationInput): Promise<Evaluation>;
  saveLineup(lineup: Lineup): Promise<Lineup>;
  deleteLineup(id: string): Promise<void>;
  saveWeights(weights: OverallWeights): Promise<void>;
  restoreDemo(): Promise<void>;
  clearAllData(): Promise<void>;
  reload(): Promise<void>;
}

export interface WorkspaceValue {
  status: WorkspaceStatus;
  /** Mensagem amigável quando status === 'error'. */
  error: string | null;
  corrupted: boolean;
  /** false: sem armazenamento do navegador, as alterações se perdem ao recarregar. */
  persistent: boolean;
  data: Workspace;
  actions: WorkspaceActions;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const SAVE_FAILED = 'Não foi possível salvar. Verifique o espaço do navegador e tente de novo.';

/** Violação de regra de negócio, com mensagem já própria para a pessoa. */
export class DomainRuleError extends Error {}

/** Garante que a mensagem mostrada à pessoa seja compreensível, sem vazar detalhes técnicos. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    throw new Error(SAVE_FAILED, { cause: error });
  }
}

export function WorkspaceProvider({ gateway, children }: { gateway?: DataGateway; children: ReactNode }) {
  const [gw] = useState<DataGateway>(() => gateway ?? new LocalStorageGateway());
  const [status, setStatus] = useState<WorkspaceStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [corrupted, setCorrupted] = useState(false);
  const [data, setData] = useState<Workspace>(() => createEmptyWorkspace());

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData(await gw.load());
      setError(null);
      setCorrupted(false);
      setStatus('ready');
    } catch (cause) {
      const isCorrupt = cause instanceof StorageCorruptedError;
      setCorrupted(isCorrupt);
      setError(isCorrupt ? cause.message : 'Não foi possível abrir os dados salvos.');
      setStatus('error');
    }
  }, [gw]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo<WorkspaceActions>(() => {
    const replace = async (next: Workspace) => {
      await guarded(() => gw.replaceWorkspace(next));
      setData(next);
      setError(null);
      setCorrupted(false);
      setStatus('ready');
    };

    return {
      async createPlayer(draft, firstEvaluation) {
        return guarded(async () => {
          if (data.players.some((p) => p.jerseyNumber === draft.jerseyNumber)) {
            throw new DomainRuleError(`O número ${draft.jerseyNumber} já está em uso.`);
          }
          const now = new Date().toISOString();
          const player: Player = { ...draft, id: newId('player'), createdAt: now, updatedAt: now, demo: false };
          await gw.savePlayer(player);
          let evaluation: Evaluation | null = null;
          if (firstEvaluation) {
            evaluation = {
              id: newId('eval'),
              playerId: player.id,
              ...firstEvaluation,
              createdAt: now,
              demo: false,
            };
            await gw.addEvaluation(evaluation);
          }
          setData((prev) => ({
            ...prev,
            players: [...prev.players, player],
            evaluations: evaluation ? [...prev.evaluations, evaluation] : prev.evaluations,
          }));
          return player;
        });
      },

      async updatePlayer(id, draft) {
        return guarded(async () => {
          const current = data.players.find((p) => p.id === id);
          if (!current) throw new DomainRuleError('Este atleta não existe mais no elenco.');
          if (data.players.some((p) => p.id !== id && p.jerseyNumber === draft.jerseyNumber)) {
            throw new DomainRuleError(`O número ${draft.jerseyNumber} já está em uso.`);
          }
          const player: Player = { ...current, ...draft, updatedAt: new Date().toISOString() };
          await gw.savePlayer(player);
          setData((prev) => ({ ...prev, players: prev.players.map((p) => (p.id === id ? player : p)) }));
          return player;
        });
      },

      async addEvaluation(playerId, input) {
        return guarded(async () => {
          if (!data.players.some((p) => p.id === playerId)) {
            throw new DomainRuleError('Este atleta não existe mais no elenco.');
          }
          const evaluation: Evaluation = {
            id: newId('eval'),
            playerId,
            ...input,
            createdAt: new Date().toISOString(),
            demo: false,
          };
          await gw.addEvaluation(evaluation);
          setData((prev) => ({ ...prev, evaluations: [...prev.evaluations, evaluation] }));
          return evaluation;
        });
      },

      async saveLineup(lineup) {
        return guarded(async () => {
          const saved: Lineup = { ...lineup, updatedAt: new Date().toISOString() };
          await gw.saveLineup(saved);
          setData((prev) => ({
            ...prev,
            lineups: prev.lineups.some((l) => l.id === saved.id)
              ? prev.lineups.map((l) => (l.id === saved.id ? saved : l))
              : [...prev.lineups, saved],
          }));
          return saved;
        });
      },

      async deleteLineup(id) {
        await guarded(async () => {
          await gw.deleteLineup(id);
          setData((prev) => ({ ...prev, lineups: prev.lineups.filter((l) => l.id !== id) }));
        });
      },

      async saveWeights(weights) {
        await guarded(async () => {
          const settings = { ...data.settings, weights };
          await gw.saveSettings(settings);
          setData((prev) => ({ ...prev, settings }));
        });
      },

      restoreDemo: () => replace(createDemoWorkspace()),
      clearAllData: () => replace({ ...createEmptyWorkspace(), settings: data.settings }),
      reload: load,
    };
  }, [gw, data, load]);

  const value = useMemo<WorkspaceValue>(
    () => ({ status, error, corrupted, persistent: gw.persistent, data, actions }),
    [status, error, corrupted, gw, data, actions],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>.');
  return value;
}
