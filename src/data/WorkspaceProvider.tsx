import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Fundamental } from '@/domain/fundamentals';
import { newId } from '@/domain/id';
import {
  applyTrainingDraft,
  buildTrainingEvent,
  checkTrainingEdit,
  type Training,
  type TrainingDraft,
  type TrainingEvent,
  type TrainingStatus,
} from '@/domain/training';
import type { Lineup } from '@/domain/lineup';
import type { OverallWeights } from '@/domain/overall';
import type { Evaluation, Player, PlayerDraft } from '@/domain/player';
import type { Attributes } from '@/domain/attributes';
import { APP_VERSION } from '@/version';
import { createBackup, validateWorkspace, type WorkspaceSummary, type WorkspaceValidation } from './backup';
import { readLastBackup, writeLastBackup, type LastBackup } from './backupMeta';
import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import { IntegrityError, StorageCorruptedError, type DataGateway, type SnapshotInfo, type StorageUsage } from './gateway';
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
  /**
   * Substitui TODO o workspace pela demonstração (mantém os pesos do Overall). A interface deve pedir
   * confirmação explícita antes: o conteúdo anterior vai para a cópia de segurança (desfazer).
   */
  restoreDemo(): Promise<void>;
  /** Apaga atletas, avaliações, escalações e treinos (mantém os pesos do Overall). Com cópia de segurança. */
  clearAllData(): Promise<void>;
  reload(): Promise<void>;

  /** Gera o backup do workspace INTEIRO (lido do armazenamento, não da tela) e registra o lembrete. */
  exportBackup(): Promise<ExportedBackup>;
  /** Troca o workspace por um já validado (importação). Com cópia de segurança; ou tudo ou nada. */
  restoreWorkspace(workspace: Workspace, reason: string): Promise<void>;
  /** Volta ao conteúdo anterior à última substituição. */
  undoLastReplacement(): Promise<void>;
  /** Texto bruto salvo, mesmo ilegível, para baixar uma cópia de emergência. */
  readRawData(): Promise<string | null>;
  /** Audita o workspace salvo agora com a mesma validação estrita da importação. */
  checkIntegrity(): Promise<WorkspaceValidation>;
  /** Quanto do armazenamento do navegador está em uso (null se só em memória). */
  usage(): Promise<StorageUsage | null>;

  /** Cria (trainingId null) ou edita um treino e seus exercícios. Nunca apaga registros. */
  saveTraining(trainingId: string | null, draft: TrainingDraft): Promise<Training>;
  /** Exclui o treino e, em cascata, seus exercícios e registros. */
  deleteTraining(trainingId: string): Promise<void>;
  setTrainingStatus(trainingId: string, status: TrainingStatus): Promise<Training>;
  /** Registra uma tentativa. Idempotente por attemptKey (devolve o evento já existente). */
  recordTrainingEvent(input: RecordTrainingInput): Promise<TrainingEvent>;
  /** Desfaz (anula) um registro específico. Repetir a chamada é inofensivo. */
  undoTrainingEvent(eventId: string): Promise<void>;
}

export interface RecordTrainingInput {
  trainingId: string;
  exerciseId: string;
  playerId: string;
  fundamental: Fundamental;
  outcome: string;
  attemptKey: string;
}

export interface ExportedBackup {
  json: string;
  filename: string;
  summary: WorkspaceSummary;
}

/** O backup não pôde ser gerado porque os dados não passaram na validação (mostra os problemas). */
export class BackupBlockedError extends Error {
  constructor(
    readonly problems: string[],
    readonly totalProblems: number,
  ) {
    super('Os dados atuais têm inconsistências e o backup não foi gerado.');
    this.name = 'BackupBlockedError';
  }
}

export interface WorkspaceValue {
  status: WorkspaceStatus;
  /** Cópia de segurança da última substituição (restaurar demo, apagar tudo, importar), ou null. */
  snapshot: SnapshotInfo | null;
  /** Último backup exportado neste navegador (lembrete; fora do workspace). */
  lastBackup: LastBackup | null;
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
    // Violação de integridade: a mensagem já é compreensível (ex.: "o treino não existe").
    if (error instanceof IntegrityError) throw new DomainRuleError(error.message);
    throw new Error(SAVE_FAILED, { cause: error });
  }
}

export function WorkspaceProvider({ gateway, children }: { gateway?: DataGateway; children: ReactNode }) {
  const [gw] = useState<DataGateway>(() => gateway ?? new LocalStorageGateway());
  const [status, setStatus] = useState<WorkspaceStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [corrupted, setCorrupted] = useState(false);
  const [data, setData] = useState<Workspace>(() => createEmptyWorkspace());
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);
  const [lastBackup, setLastBackup] = useState<LastBackup | null>(() => readLastBackup());
  // Estado mais recente para validar registros em toques rápidos, antes de o React re-renderizar.
  const latest = useRef(data);
  latest.current = data;

  const refreshSnapshot = useCallback(async () => {
    try {
      setSnapshot(await gw.snapshotInfo());
    } catch {
      setSnapshot(null);
    }
  }, [gw]);

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
    void refreshSnapshot();
  }, [gw, refreshSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  // Outra aba mudou os dados: recarrega em silêncio (sem piscar a tela de carregamento) para não
  // trabalhar em cima de uma cópia velha, que depois poderia sobrescrever o que a outra aba fez.
  useEffect(
    () =>
      gw.subscribe(() => {
        gw.load()
          .then((fresh) => {
            setData(fresh);
            setError(null);
            setCorrupted(false);
            setStatus('ready');
            void refreshSnapshot();
          })
          .catch(() => {
            /* se o dado ficou ilegível, o próximo carregamento mostra o aviso */
          });
      }),
    [gw, refreshSnapshot],
  );

  // Pede ao navegador que não apague os dados sozinho quando faltar espaço. Pode ser negado: tudo bem.
  useEffect(() => {
    if (status === 'ready' && gw.persistent) void navigator.storage?.persist?.().catch(() => undefined);
  }, [status, gw]);

  const actions = useMemo<WorkspaceActions>(() => {
    /** Troca o workspace inteiro. A cópia de segurança é feita pelo gateway antes de gravar. */
    const replace = async (next: Workspace, reason: string) => {
      await guarded(() => gw.replaceWorkspace(next, reason));
      setData(next);
      setError(null);
      setCorrupted(false);
      setStatus('ready');
      await refreshSnapshot();
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

      async saveTraining(trainingId, draft) {
        return guarded(async () => {
          const current = latest.current;
          const existing = trainingId ? (current.trainings.find((t) => t.id === trainingId) ?? null) : null;
          if (trainingId && !existing) throw new DomainRuleError('Este treino não existe mais.');
          if (existing) {
            const blocked = checkTrainingEdit(existing, draft, current.exercises, current.trainingEvents, current.players);
            if (blocked) throw new DomainRuleError(blocked);
          }
          const unknown = draft.participantIds.find((id) => !current.players.some((p) => p.id === id));
          if (unknown) throw new DomainRuleError('Há participante que não está mais no elenco.');

          const { training, exercises } = applyTrainingDraft(existing, draft, new Date().toISOString(), newId);
          await gw.saveTraining(training, exercises);
          setData((prev) => ({
            ...prev,
            trainings: prev.trainings.some((t) => t.id === training.id)
              ? prev.trainings.map((t) => (t.id === training.id ? training : t))
              : [...prev.trainings, training],
            exercises: [...prev.exercises.filter((e) => e.trainingId !== training.id), ...exercises],
          }));
          return training;
        });
      },

      async deleteTraining(trainingId) {
        await guarded(async () => {
          await gw.deleteTraining(trainingId);
          setData((prev) => ({
            ...prev,
            trainings: prev.trainings.filter((t) => t.id !== trainingId),
            exercises: prev.exercises.filter((e) => e.trainingId !== trainingId),
            trainingEvents: prev.trainingEvents.filter((e) => e.trainingId !== trainingId),
          }));
          await refreshSnapshot(); // a exclusão guardou uma cópia de segurança
        });
      },

      async setTrainingStatus(trainingId, status) {
        return guarded(async () => {
          const current = latest.current;
          const existing = current.trainings.find((t) => t.id === trainingId);
          if (!existing) throw new DomainRuleError('Este treino não existe mais.');
          const now = new Date().toISOString();
          const training: Training = {
            ...existing,
            status,
            completedAt: status === 'concluido' ? now : null,
            updatedAt: now,
          };
          await gw.saveTraining(
            training,
            current.exercises.filter((e) => e.trainingId === trainingId),
          );
          setData((prev) => ({ ...prev, trainings: prev.trainings.map((t) => (t.id === trainingId ? training : t)) }));
          return training;
        });
      },

      async recordTrainingEvent(input) {
        return guarded(async () => {
          const current = latest.current;
          const outcome = buildTrainingEvent(
            { ...input, id: newId('event'), recordedAt: new Date().toISOString() },
            {
              trainings: current.trainings,
              exercises: current.exercises,
              events: current.trainingEvents,
              players: current.players,
            },
          );
          if (!outcome.ok) throw new DomainRuleError(outcome.reason);
          if (outcome.duplicate) return outcome.event; // mesmo toque repetido: não grava de novo
          await gw.addTrainingEvent(outcome.event);
          setData((prev) =>
            prev.trainingEvents.some((e) => e.attemptKey === outcome.event.attemptKey)
              ? prev
              : { ...prev, trainingEvents: [...prev.trainingEvents, outcome.event] },
          );
          return outcome.event;
        });
      },

      async undoTrainingEvent(eventId) {
        await guarded(async () => {
          const target = latest.current.trainingEvents.find((e) => e.id === eventId);
          if (!target) throw new DomainRuleError('Este registro não existe mais.');
          if (target.voidedAt !== null) return; // já desfeito: repetir não faz nada
          const voidedAt = new Date().toISOString();
          await gw.voidTrainingEvent(eventId, voidedAt);
          setData((prev) => ({
            ...prev,
            trainingEvents: prev.trainingEvents.map((e) => (e.id === eventId && e.voidedAt === null ? { ...e, voidedAt } : e)),
          }));
        });
      },

      // Mantém os pesos do Overall: são configuração da equipe, não dados de demonstração.
      restoreDemo: () => replace({ ...createDemoWorkspace(), settings: latest.current.settings }, 'restauração da demonstração'),
      clearAllData: () =>
        replace({ ...createEmptyWorkspace(), settings: latest.current.settings }, 'exclusão de todos os dados'),
      reload: load,

      async exportBackup() {
        // Lê do armazenamento (não do que está na tela): pega o workspace inteiro, inclusive o que outra aba salvou.
        let fresh: Workspace;
        try {
          fresh = await gw.load();
        } catch (cause) {
          if (cause instanceof StorageCorruptedError) {
            throw new DomainRuleError('Os dados salvos estão ilegíveis e não dá para gerar um backup estruturado. Baixe a cópia bruta dos dados.');
          }
          throw new DomainRuleError('Não foi possível ler os dados para gerar o backup.');
        }
        const result = createBackup(fresh, { appVersion: APP_VERSION });
        if (!result.ok) throw new BackupBlockedError(result.errors, result.totalErrors);
        const meta: LastBackup = { at: result.file.exportedAt, fingerprint: result.file.checksum.value, filename: result.filename };
        writeLastBackup(meta);
        setLastBackup(meta);
        return { json: result.json, filename: result.filename, summary: result.summary };
      },

      restoreWorkspace: (workspace, reason) => replace(workspace, reason),

      async undoLastReplacement() {
        await guarded(() => gw.restoreSnapshot());
        setData(await gw.load());
        setError(null);
        setCorrupted(false);
        setStatus('ready');
        await refreshSnapshot();
      },

      readRawData: () => gw.exportRaw(),

      usage: () => gw.usage(),

      async checkIntegrity() {
        const fresh = await gw.load();
        return validateWorkspace(JSON.parse(JSON.stringify(fresh)) as unknown);
      },
    };
  }, [gw, data, load]);

  const value = useMemo<WorkspaceValue>(
    () => ({ status, snapshot, lastBackup, error, corrupted, persistent: gw.persistent, data, actions }),
    [status, snapshot, lastBackup, error, corrupted, gw, data, actions],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>.');
  return value;
}
