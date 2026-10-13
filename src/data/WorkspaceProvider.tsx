import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Fundamental } from '@/domain/fundamentals';
import { newId } from '@/domain/id';
import { matchState, validateMatchDraft, type Match, type MatchDraft, type MatchSet, type Rally, type RallyAction, type RallyReason, type SetStarter, type Side } from '@/domain/match';
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
import { useAccess } from '@/auth/AccessContext';
import { CAPABILITY_LABEL, ROLE_LABEL, type Capability } from '@/auth/permissions';
import { createBackup, validateWorkspace, type WorkspaceSummary, type WorkspaceValidation } from './backup';
import { readLastBackup, writeLastBackup, type LastBackup } from './backupMeta';
import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import {
  ConflictError,
  IntegrityError,
  PermissionDeniedError,
  RemoteDataError,
  RemoteOperationUnavailableError,
  RemoteUnavailableError,
  SessionExpiredError,
  StorageCorruptedError,
  WorkspaceMissingError,
  type DataGateway,
  type RawCopy,
  type SnapshotInfo,
  type StorageUsage,
} from './gateway';
import { LocalStorageGateway } from './localStorageGateway';
import { findMatch as findMatchIn } from './matchOps';
import type { Workspace } from './types';

/**
 * loading  → lendo o armazenamento.
 * ready    → há workspace carregado.
 * setup    → primeira utilização: a pessoa escolhe como começar (nada é criado antes disso).
 * recovery → o workspace sumiu ou está ilegível, mas há sinais de uso anterior: a pessoa decide.
 * error    → falha inesperada de leitura (tentar de novo).
 */
export type WorkspaceStatus = 'loading' | 'ready' | 'setup' | 'recovery' | 'error';

/** Por que a recuperação foi aberta: workspace ausente com sinais de uso anterior, ou dado ilegível. */
export type RecoveryReason = 'lost' | 'unreadable';

/** Como começar um workspace novo. */
export type StartKind = 'demo' | 'empty';

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
  /**
   * Começa um workspace novo (demonstração ou vazio) depois de a pessoa escolher/confirmar na tela de
   * início ou de recuperação. Se havia conteúdo ilegível, ele vai para a cópia de segurança antes.
   */
  startNew(kind: StartKind): Promise<void>;
  /** Textos brutos que ainda existem e podem ser baixados para recuperação manual. */
  recoveryCopies(): Promise<RawCopy[]>;
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

  /* ───────── partidas ───────── */

  /** Cria (matchId null) ou edita os dados de uma partida. Status e resultado só mudam pelas ações abaixo. */
  saveMatch(matchId: string | null, draft: MatchDraft): Promise<Match>;
  /** Exclui a partida e, em cascata, sets, pontos e ações técnicas dela (só comissão técnica). */
  deleteMatch(matchId: string): Promise<void>;
  startMatchSet(matchId: string, input: StartMatchSetInput): Promise<MatchSet>;
  /**
   * Registra um ponto (e, opcionalmente, ações técnicas dele). Idempotente por attemptKey; se a tela estava atrasada
   * (outra pessoa registrou antes), nada é gravado, os dados são recarregados e a ação falha com explicação.
   */
  recordRally(matchId: string, input: RecordRallyInput): Promise<Rally>;
  /** Desfaz (anula) o último ponto da partida, do set atual. */
  undoLastRally(matchId: string): Promise<void>;
  cancelEmptySet(matchId: string, number: number): Promise<void>;
  concludeMatch(matchId: string): Promise<Match>;
  /** Reabre uma partida concluída para corrigi-la (só comissão técnica). */
  reopenMatch(matchId: string): Promise<Match>;
  addRallyAction(rallyId: string, input: RallyActionDraft): Promise<RallyAction>;
  undoRallyAction(actionId: string): Promise<void>;
}

export interface StartMatchSetInput {
  firstServer: Side;
  starters: SetStarter[];
  liberoId: string | null;
}

export interface RallyActionDraft {
  playerId: string;
  fundamental: Fundamental;
  outcome: string;
  /** Chave de idempotência da ação (uma por intenção da pessoa). */
  attemptKey: string;
}

export interface RecordRallyInput {
  setNumber: number;
  /** Número do ponto que a tela espera registrar (detecta tela atrasada). */
  expectedSeq: number;
  winner: Side;
  reason: RallyReason | null;
  playerId: string | null;
  attemptKey: string;
  actions: RallyActionDraft[];
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
  /** Mensagem amigável quando status === 'error' ou quando o dado está ilegível. */
  error: string | null;
  /** Preenchido quando status === 'recovery'. */
  recoveryReason: RecoveryReason | null;
  /**
   * Quantas inconsistências a validação estrita achou nos dados carregados (0 = nenhuma). Não bloqueia
   * o uso: avisa e leva para "Verificar integridade". Atualizado ao carregar/substituir, não a cada edição.
   */
  integrityProblems: number;
  /** `local`: dados neste navegador. `remote`: dados da equipe no Supabase (sem substituir workspace, sem cópia local). */
  backend: 'local' | 'remote';
  /** false: sem armazenamento do navegador, as alterações se perdem ao recarregar. */
  persistent: boolean;
  data: Workspace;
  actions: WorkspaceActions;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const SAVE_FAILED = 'Não foi possível salvar. Verifique o espaço do navegador e tente de novo.';

/** Violação de regra de negócio, com mensagem já própria para a pessoa. */
export class DomainRuleError extends Error {}

/** Número de inconsistências da validação estrita (0 se íntegro ou se a validação não pôde rodar). */
function countProblems(workspace: Workspace): number {
  try {
    const checked = validateWorkspace(JSON.parse(JSON.stringify(workspace)) as unknown);
    return checked.ok ? 0 : checked.totalErrors;
  } catch {
    return 0;
  }
}

/** Erros cuja mensagem já foi escrita para a pessoa (não vazam detalhes técnicos). */
function isUserFacing(error: unknown): error is Error {
  return (
    error instanceof IntegrityError ||
    error instanceof PermissionDeniedError ||
    error instanceof SessionExpiredError ||
    error instanceof RemoteUnavailableError ||
    error instanceof RemoteDataError ||
    error instanceof RemoteOperationUnavailableError
  );
}

/** Garante que a mensagem mostrada à pessoa seja compreensível, sem vazar detalhes técnicos. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    // Erros já traduzidos pelo gateway (integridade, permissão, sessão, conexão): a mensagem é compreensível.
    if (isUserFacing(error)) throw new DomainRuleError(error.message);
    throw new Error(SAVE_FAILED, { cause: error });
  }
}

export function WorkspaceProvider({ gateway, children }: { gateway?: DataGateway; children: ReactNode }) {
  const [gw] = useState<DataGateway>(() => gateway ?? new LocalStorageGateway());
  const access = useAccess();
  const [status, setStatus] = useState<WorkspaceStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason | null>(null);
  const [integrityProblems, setIntegrityProblems] = useState(0);
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

  /** Um workspace foi carregado ou colocado no lugar: a tela passa a mostrá-lo. */
  const applyLoaded = useCallback((workspace: Workspace) => {
    setData(workspace);
    setError(null);
    setRecoveryReason(null);
    setIntegrityProblems(countProblems(workspace));
    setStatus('ready');
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      applyLoaded(await gw.load());
    } catch (cause) {
      // Nunca cria dados aqui: ausência e dado ilegível só levam a telas em que a PESSOA decide.
      if (cause instanceof WorkspaceMissingError) {
        setError(null);
        setRecoveryReason(cause.kind === 'lost' ? 'lost' : null);
        setStatus(cause.kind === 'lost' ? 'recovery' : 'setup');
      } else if (cause instanceof StorageCorruptedError) {
        setError(cause.message);
        setRecoveryReason('unreadable');
        setStatus('recovery');
      } else {
        setError(isUserFacing(cause) ? cause.message : 'Não foi possível abrir os dados salvos.');
        setRecoveryReason(null);
        setStatus('error');
      }
    }
    void refreshSnapshot();
  }, [gw, refreshSnapshot, applyLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  // Outra aba mudou os dados: recarrega em silêncio (sem piscar a tela de carregamento) para não
  // trabalhar em cima de uma cópia velha, que depois poderia sobrescrever o que a outra aba fez.
  // Se os dados sumiram ou ficaram ilegíveis, esta aba mantém o que tem na tela e as gravações são
  // recusadas (o gateway não recria dados); recarregar a página abre a recuperação.
  useEffect(
    () =>
      gw.subscribe(() => {
        gw.load()
          .then((fresh) => {
            applyLoaded(fresh);
            void refreshSnapshot();
          })
          .catch(() => undefined);
      }),
    [gw, refreshSnapshot, applyLoaded],
  );

  // Pede ao navegador que não apague os dados sozinho quando faltar espaço. Pode ser negado: tudo bem.
  useEffect(() => {
    if (status === 'ready' && gw.kind === 'local' && gw.persistent) void navigator.storage?.persist?.().catch(() => undefined);
  }, [status, gw]);

  const actions = useMemo<WorkspaceActions>(() => {
    /**
     * Confere o papel ANTES de tentar gravar. É conforto de interface (mensagem clara): quem decide de verdade
     * é a RLS do banco, que recusaria a escrita de qualquer forma.
     */
    const allow = (capability: Capability) => {
      if (access.can(capability)) return;
      const role = access.role ? ROLE_LABEL[access.role] : '';
      throw new DomainRuleError(`Seu papel (${role}) não permite ${CAPABILITY_LABEL[capability]}.`);
    };

    /**
     * Trabalho de partida: se a tela estava atrasada (ConflictError), nada foi gravado; recarrega os dados da fonte e
     * explica, para a pessoa olhar o placar atual antes de repetir.
     */
    const matchWork = async <T,>(work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        if (error instanceof ConflictError) {
          try {
            applyLoaded(await gw.load());
          } catch {
            /* sem conexão agora: a mensagem abaixo já diz que nada foi gravado */
          }
          throw new DomainRuleError(error.message);
        }
        throw error;
      }
    };

    /** Troca o workspace inteiro. A cópia de segurança é feita pelo gateway antes de gravar. */
    const replace = async (next: Workspace, reason: string) => {
      await guarded(() => gw.replaceWorkspace(next, reason));
      applyLoaded(next);
      await refreshSnapshot();
    };

    return {
      async createPlayer(draft, firstEvaluation) {
        return guarded(async () => {
          allow('players:write');
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
          allow('players:write');
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
          allow('evaluations:add');
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
          allow('lineups:write');
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
          allow('lineups:write');
          await gw.deleteLineup(id);
          setData((prev) => ({ ...prev, lineups: prev.lineups.filter((l) => l.id !== id) }));
        });
      },

      async saveWeights(weights) {
        await guarded(async () => {
          allow('weights:write');
          const settings = { ...data.settings, weights };
          await gw.saveSettings(settings);
          setData((prev) => ({ ...prev, settings }));
        });
      },

      async saveTraining(trainingId, draft) {
        return guarded(async () => {
          allow('trainings:write');
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
          allow('trainings:delete');
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
          allow('trainings:write');
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
          allow('events:record');
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
          allow('events:record');
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

      async saveMatch(matchId, draft) {
        return guarded(async () => {
          allow('matches:write');
          const checked = validateMatchDraft(draft);
          if (!checked.ok) throw new DomainRuleError(Object.values(checked.errors)[0] ?? 'Dados da partida inválidos.');
          const current = latest.current;
          const existing = matchId ? (current.matches.find((m) => m.id === matchId) ?? null) : null;
          if (matchId && !existing) throw new DomainRuleError('Esta partida não existe mais.');
          const now = new Date().toISOString();
          const next: Match = existing
            ? { ...existing, ...checked.value, updatedAt: now }
            : { ...checked.value, id: newId('match'), status: 'agendada', finalSetsUs: null, finalSetsThem: null, concludedAt: null, createdAt: now, updatedAt: now };
          const saved = await gw.saveMatch(next);
          setData((prev) => ({
            ...prev,
            matches: prev.matches.some((m) => m.id === saved.id) ? prev.matches.map((m) => (m.id === saved.id ? saved : m)) : [...prev.matches, saved],
          }));
          return saved;
        });
      },

      async deleteMatch(matchId) {
        await guarded(async () => {
          allow('matches:delete');
          await gw.deleteMatch(matchId);
          setData((prev) => ({
            ...prev,
            matches: prev.matches.filter((m) => m.id !== matchId),
            matchSets: prev.matchSets.filter((s) => s.matchId !== matchId),
            rallies: prev.rallies.filter((r) => r.matchId !== matchId),
            rallyActions: prev.rallyActions.filter((a) => a.matchId !== matchId),
          }));
          await refreshSnapshot(); // a exclusão local guardou uma cópia de segurança
        });
      },

      async startMatchSet(matchId, input) {
        return guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const state = matchState(findMatchIn(latest.current, matchId), latest.current.matchSets, latest.current.rallies);
            const number = state.nextSetNumber ?? (state.current ? state.current.set.number + 1 : 1);
            const { set, match } = await gw.startSet(matchId, { number, ...input, createdAt: new Date().toISOString() });
            setData((prev) => ({
              ...prev,
              matches: prev.matches.map((m) => (m.id === match.id ? match : m)),
              matchSets: [...prev.matchSets.filter((s) => !(s.matchId === set.matchId && s.number === set.number)), set],
            }));
            return set;
          }),
        );
      },

      async recordRally(matchId, input) {
        return guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const recordedAt = new Date().toISOString();
            const result = await gw.recordRally(matchId, {
              id: newId('rally'),
              attemptKey: input.attemptKey,
              setNumber: input.setNumber,
              expectedSeq: input.expectedSeq,
              winner: input.winner,
              reason: input.reason,
              playerId: input.playerId,
              recordedAt,
              actions: input.actions.map((a) => ({ id: newId('ract'), attemptKey: a.attemptKey, playerId: a.playerId, fundamental: a.fundamental, outcome: a.outcome })),
            });
            setData((prev) =>
              prev.rallies.some((r) => r.id === result.rally.id)
                ? prev
                : { ...prev, rallies: [...prev.rallies, result.rally], rallyActions: [...prev.rallyActions, ...result.actions.filter((a) => !prev.rallyActions.some((x) => x.id === a.id))] },
            );
            return result.rally;
          }),
        );
      },

      async undoLastRally(matchId) {
        await guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const state = matchState(findMatchIn(latest.current, matchId), latest.current.matchSets, latest.current.rallies);
            if (!state.lastRally) throw new DomainRuleError('Não há ponto para desfazer.');
            const rally = state.lastRally;
            const voidedAt = new Date().toISOString();
            await gw.voidLastRally(matchId, rally.id, voidedAt);
            setData((prev) => ({
              ...prev,
              rallies: prev.rallies.map((r) => (r.id === rally.id ? { ...r, voidedAt } : r)),
              rallyActions: prev.rallyActions.map((a) => (a.rallyId === rally.id && a.voidedAt === null ? { ...a, voidedAt } : a)),
            }));
          }),
        );
      },

      async cancelEmptySet(matchId, number) {
        await guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const match = await gw.cancelEmptySet(matchId, number);
            setData((prev) => ({
              ...prev,
              matches: prev.matches.map((m) => (m.id === match.id ? match : m)),
              matchSets: prev.matchSets.filter((s) => !(s.matchId === matchId && s.number === number)),
            }));
          }),
        );
      },

      async concludeMatch(matchId) {
        return guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const match = await gw.concludeMatch(matchId, new Date().toISOString());
            setData((prev) => ({ ...prev, matches: prev.matches.map((m) => (m.id === match.id ? match : m)) }));
            return match;
          }),
        );
      },

      async reopenMatch(matchId) {
        return guarded(() =>
          matchWork(async () => {
            allow('matches:reopen');
            const match = await gw.reopenMatch(matchId);
            setData((prev) => ({ ...prev, matches: prev.matches.map((m) => (m.id === match.id ? match : m)) }));
            return match;
          }),
        );
      },

      async addRallyAction(rallyId, input) {
        return guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const action = await gw.addRallyAction({ id: newId('ract'), rallyId, ...input, recordedAt: new Date().toISOString() });
            setData((prev) => (prev.rallyActions.some((a) => a.id === action.id) ? prev : { ...prev, rallyActions: [...prev.rallyActions, action] }));
            return action;
          }),
        );
      },

      async undoRallyAction(actionId) {
        await guarded(() =>
          matchWork(async () => {
            allow('matches:write');
            const voidedAt = new Date().toISOString();
            await gw.voidRallyAction(actionId, voidedAt);
            setData((prev) => ({ ...prev, rallyActions: prev.rallyActions.map((a) => (a.id === actionId && a.voidedAt === null ? { ...a, voidedAt } : a)) }));
          }),
        );
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

      startNew: (kind) =>
        replace(
          kind === 'demo' ? createDemoWorkspace() : createEmptyWorkspace(),
          kind === 'demo' ? 'início com dados de demonstração' : 'início com workspace vazio',
        ),

      async undoLastReplacement() {
        await guarded(() => gw.restoreSnapshot());
        applyLoaded(await gw.load());
        await refreshSnapshot();
      },

      readRawData: () => gw.exportRaw(),

      recoveryCopies: () => gw.recoveryCopies(),

      usage: () => gw.usage(),

      async checkIntegrity() {
        const fresh = await gw.load();
        return validateWorkspace(JSON.parse(JSON.stringify(fresh)) as unknown);
      },
    };
  }, [gw, data, load, applyLoaded, access]);

  const value = useMemo<WorkspaceValue>(
    () => ({ status, snapshot, lastBackup, error, recoveryReason, integrityProblems, backend: gw.kind, persistent: gw.persistent, data, actions }),
    [status, snapshot, lastBackup, error, recoveryReason, integrityProblems, gw, data, actions],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>.');
  return value;
}
