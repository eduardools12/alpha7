import type { Lineup } from '@/domain/lineup';
import type { Match, MatchSet, Rally, RallyAction } from '@/domain/match';
import type { OverallWeights } from '@/domain/overall';
import type { Evaluation, Player } from '@/domain/player';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';

export interface Settings {
  weights: OverallWeights;
}

/**
 * Resumo de atividade COMPETITIVA usado pelo dashboard. Só existe como dado de
 * DEMONSTRAÇÃO: o módulo de partidas ainda não foi implementado (veja docs/DATA_MODEL.md).
 * Treinos NÃO fazem parte daqui: vêm dos registros reais em Workspace.trainings.
 */
export interface ActivitySnapshot {
  demo: true;
  matches: { played: number; wins: number };
  nextMatch: { opponent: string; competition: string; scheduledAt: string; venue: string } | null;
}

export interface Workspace {
  players: Player[];
  evaluations: Evaluation[];
  lineups: Lineup[];
  settings: Settings;
  activity: ActivitySnapshot | null;
  /** Treinos, exercícios e eventos de treino ficam em coleções separadas, ligadas por id. */
  trainings: Training[];
  exercises: TrainingExercise[];
  trainingEvents: TrainingEvent[];
  /**
   * Partidas, sets, rallies e ações técnicas (v0.5). Coleções ADITIVAS e separadas dos treinos: dados salvos antes
   * das partidas abrem com listas vazias. O placar nunca é gravado: é derivado dos rallies ativos.
   */
  matches: Match[];
  matchSets: MatchSet[];
  rallies: Rally[];
  rallyActions: RallyAction[];
}
