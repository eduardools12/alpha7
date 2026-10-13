import type { Lineup } from '@/domain/lineup';
import type { OverallWeights } from '@/domain/overall';
import type { Evaluation, Player } from '@/domain/player';

export interface Settings {
  weights: OverallWeights;
}

export type TrainingIntensity = 'baixa' | 'media' | 'alta';

/**
 * Resumo de atividade (treinos e partidas) usado pelo dashboard.
 * Na primeira entrega só existe como dado de DEMONSTRAÇÃO: o registro real de
 * treinos e partidas ainda não foi implementado (veja docs/DATA_MODEL.md).
 */
export interface ActivitySnapshot {
  demo: true;
  trainingsCount: number;
  matches: { played: number; wins: number };
  nextMatch: { opponent: string; competition: string; scheduledAt: string; venue: string } | null;
  lastTraining: {
    date: string;
    focus: string;
    attendance: { present: number; total: number };
    intensity: TrainingIntensity;
  } | null;
}

export interface Workspace {
  players: Player[];
  evaluations: Evaluation[];
  lineups: Lineup[];
  settings: Settings;
  activity: ActivitySnapshot | null;
}
