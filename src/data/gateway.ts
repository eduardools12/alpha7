import type { Lineup } from '@/domain/lineup';
import type { Evaluation, Player } from '@/domain/player';
import type { Settings, Workspace } from './types';

/**
 * Fronteira de persistência. A interface e as regras de negócio só conhecem este
 * contrato; hoje ele é atendido por localStorage (LocalStorageGateway) e poderá ser
 * atendido pelo Supabase sem alterar telas nem domínio.
 *
 * Mapeamento previsto para o banco: players, evaluations, lineups, settings (tabelas
 * em docs/DATA_MODEL.md). `replaceWorkspace` existe só para restaurar/limpar a demonstração.
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
}

/** Os dados salvos existem, mas não têm o formato esperado. */
export class StorageCorruptedError extends Error {
  constructor(detail: string) {
    super(`Os dados salvos neste navegador estão ilegíveis (${detail}).`);
    this.name = 'StorageCorruptedError';
  }
}
