import type { Lineup } from '@/domain/lineup';
import type { Evaluation, Player } from '@/domain/player';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';
import type { Settings, Workspace } from './types';

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
  load(): Promise<Workspace>;
  savePlayer(player: Player): Promise<void>;
  addEvaluation(evaluation: Evaluation): Promise<void>;
  saveLineup(lineup: Lineup): Promise<void>;
  deleteLineup(lineupId: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  replaceWorkspace(workspace: Workspace): Promise<void>;

  /**
   * Grava o treino e SUBSTITUI a lista de exercícios dele. Eventos nunca são tocados.
   * Falha com IntegrityError se a troca de exercícios deixaria eventos sem exercício.
   */
  saveTraining(training: Training, exercises: TrainingExercise[]): Promise<void>;
  /** Exclui o treino e, em cascata, seus exercícios e eventos, de forma atômica. */
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

/** A operação deixaria referências quebradas (evento sem treino, exercício de outro treino...). */
export class IntegrityError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'IntegrityError';
  }
}
