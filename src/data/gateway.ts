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
  /** false quando o armazenamento do navegador não está disponível (dados só em memória). */
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

/** A operação deixaria referências quebradas (evento sem treino, exercício de outro treino...). */
export class IntegrityError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'IntegrityError';
  }
}
