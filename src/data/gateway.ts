import type { Lineup } from '@/domain/lineup';
import type { Evaluation, Player } from '@/domain/player';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';
import type { WorkspaceSummary } from './backup';
import type { Settings, Workspace } from './types';

/**
 * Uso do localStorage pelo Alpha7, em caracteres (o navegador conta assim). O limite real varia por
 * navegador (em geral cerca de 5 milhões de caracteres por site); `limitChars` é uma estimativa prudente.
 */
export interface StorageUsage {
  usedChars: number;
  limitChars: number;
  workspaceChars: number;
  /** A cópia de segurança automática também ocupa espaço. */
  snapshotChars: number;
}

/** Um texto bruto guardado que a pessoa pode baixar para recuperação manual (não é um backup restaurável). */
export interface RawCopy {
  id: 'current' | 'unreadable' | 'snapshot';
  /** Descrição para a tela. */
  label: string;
  text: string;
}

/** Cópia de segurança automática feita antes de substituir o workspace. */
export interface SnapshotInfo {
  savedAt: string;
  /** Por que foi guardada (ex.: "restauração da demonstração"). */
  reason: string;
  /** O que a cópia contém; null se o conteúdo guardado não pôde ser lido. */
  summary: WorkspaceSummary | null;
}

/**
 * Fronteira de persistência. A interface e as regras de negócio só conhecem este
 * contrato; hoje ele é atendido por localStorage (LocalStorageGateway) e poderá ser
 * atendido pelo Supabase sem alterar telas nem domínio.
 *
 * Mapeamento previsto para o banco: players, evaluations, lineups, settings, trainings,
 * training_exercises, training_actions (tabelas em docs/DATA_MODEL.md). `replaceWorkspace`
 * existe só para restaurar/limpar a demonstração.
 */
export interface DataGateway {
  /**
   * `local`: dados neste navegador (localStorage), com cópia de segurança, desfazer e substituição do workspace.
   * `remote`: dados da equipe no Supabase. Substituir o workspace inteiro, cópia automática e desfazer NÃO existem
   * aqui (nenhum dado é apagado ou trocado em bloco pelo aplicativo); a interface esconde esses recursos.
   */
  readonly kind: 'local' | 'remote';
  /** false quando o armazenamento do navegador não está disponível (dados só em memória). Remoto: sempre true. */
  readonly persistent: boolean;
  /**
   * Lê o workspace. NUNCA cria dados sozinho: se não existe workspace, falha com WorkspaceMissingError
   * (`first-use` quando não há sinal de uso anterior; `lost` quando há). Dado ilegível falha com
   * StorageCorruptedError. Quem decide o que fazer é a pessoa, na tela de início ou de recuperação.
   */
  load(): Promise<Workspace>;
  savePlayer(player: Player): Promise<void>;
  addEvaluation(evaluation: Evaluation): Promise<void>;
  saveLineup(lineup: Lineup): Promise<void>;
  deleteLineup(lineupId: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /**
   * Substitui o workspace INTEIRO (restaurar demonstração, apagar tudo, importar backup). Antes de
   * gravar, guarda uma cópia de segurança do conteúdo anterior; se não conseguir guardá-la, a operação
   * é abortada e nada muda (IntegrityError). A troca em si é uma única gravação: nunca fica pela metade.
   */
  replaceWorkspace(workspace: Workspace, reason?: string): Promise<void>;
  /** Cópia de segurança da última substituição, ou null. */
  snapshotInfo(): Promise<SnapshotInfo | null>;
  /** Desfaz a última substituição (e guarda o estado atual como nova cópia: dá para ir e voltar). */
  restoreSnapshot(): Promise<void>;
  /** Texto bruto salvo (mesmo ilegível), para baixar uma cópia mesmo com dados corrompidos. */
  exportRaw(): Promise<string | null>;
  /** Todos os textos brutos que ainda existem (dados salvos, cópia do ilegível, cópia automática). Pode ser vazio. */
  recoveryCopies(): Promise<RawCopy[]>;
  /** Avisa quando os dados mudam em OUTRA aba do navegador. Devolve a função que cancela. */
  subscribe(listener: () => void): () => void;
  /** Quanto do armazenamento do navegador os dados ocupam; null se não há armazenamento (só memória). */
  usage(): Promise<StorageUsage | null>;

  /**
   * Grava o treino e SUBSTITUI a lista de exercícios dele. Eventos nunca são tocados.
   * Falha com IntegrityError se a troca de exercícios deixaria eventos sem exercício.
   */
  saveTraining(training: Training, exercises: TrainingExercise[]): Promise<void>;
  /**
   * Exclui o treino e, em cascata, seus exercícios e eventos, de forma atômica. Como apaga muitos
   * registros de uma vez, guarda antes a cópia de segurança (a mesma da substituição do workspace);
   * se não conseguir guardá-la, a exclusão é abortada (IntegrityError).
   */
  deleteTraining(trainingId: string): Promise<void>;
  /**
   * Acrescenta um evento. Idempotente por attemptKey: se já existe, não duplica.
   * Falha com IntegrityError se treino, exercício ou atleta não existirem ou não se
   * relacionarem (exercício de outro treino, atleta fora da lista de participantes).
   */
  addTrainingEvent(event: TrainingEvent): Promise<void>;
  /** "Desfazer": anula o evento (voidedAt), sem apagá-lo. Idempotente. */
  voidTrainingEvent(eventId: string, voidedAt: string): Promise<void>;
}

/** Os dados salvos existem, mas não têm o formato esperado. */
export class StorageCorruptedError extends Error {
  constructor(detail: string) {
    super(`Os dados salvos neste navegador estão ilegíveis (${detail}).`);
    this.name = 'StorageCorruptedError';
  }
}

/**
 * Não há workspace salvo. `first-use`: nenhum sinal de uso anterior neste navegador (primeira
 * utilização, ou dados do site apagados por inteiro: o localStorage não permite distinguir).
 * `lost`: há sinais de uso anterior (marca de sessão, cópia de segurança, backup registrado ou cópia de
 * dado ilegível), então o workspace sumiu e não deve ser trocado por demonstração sem a pessoa decidir.
 */
export class WorkspaceMissingError extends Error {
  constructor(readonly kind: 'first-use' | 'lost') {
    super(
      kind === 'lost'
        ? 'Os dados da equipe não foram encontrados neste navegador, mas há sinais de que já existiram.'
        : 'Ainda não há dados neste navegador.',
    );
    this.name = 'WorkspaceMissingError';
  }
}

/** O banco recusou a operação por falta de permissão (RLS): o papel da pessoa não permite. */
export class PermissionDeniedError extends Error {
  constructor(detail = 'Seu papel na equipe não permite esta ação.') {
    super(detail);
    this.name = 'PermissionDeniedError';
  }
}

/** A sessão de login expirou ou foi encerrada: é preciso entrar de novo. Nada foi gravado. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Sua sessão expirou. Entre novamente para continuar. Nada foi gravado.');
    this.name = 'SessionExpiredError';
  }
}

/** Sem conexão com o servidor (rede, serviço fora do ar). Nada foi gravado. */
export class RemoteUnavailableError extends Error {
  constructor() {
    super('Sem conexão com o servidor. Verifique a internet e tente de novo. Nada foi gravado.');
    this.name = 'RemoteUnavailableError';
  }
}

/** O servidor devolveu algo que o aplicativo não entende (dado fora do formato esperado ou falha inesperada). */
export class RemoteDataError extends Error {
  constructor(detail: string) {
    super(`Os dados recebidos do servidor não puderam ser usados (${detail}). Nada foi alterado.`);
    this.name = 'RemoteDataError';
  }
}

/** A operação não existe com o backend remoto (por exemplo, substituir o workspace inteiro). */
export class RemoteOperationUnavailableError extends Error {
  constructor(operation: string) {
    super(`${operation} não está disponível com os dados na nuvem. Nenhum dado foi alterado.`);
    this.name = 'RemoteOperationUnavailableError';
  }
}

/** A operação deixaria referências quebradas (evento sem treino, exercício de outro treino...). */
export class IntegrityError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'IntegrityError';
  }
}
