import type { WorkspaceSummary } from '@/data/backup';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "18 atletas, 108 avaliações, 1 escalação, 4 treinos e 880 registros de treino". */
export function describeSummary(s: WorkspaceSummary): string {
  return [
    plural(s.players, 'atleta', 'atletas'),
    plural(s.evaluations, 'avaliação', 'avaliações'),
    plural(s.lineups, 'escalação', 'escalações'),
    plural(s.trainings, 'treino', 'treinos'),
  ].join(', ') + ` e ${plural(s.trainingEvents, 'registro de treino', 'registros de treino')}`;
}

/** Quanto do conteúdo foi criado pela equipe e quanto é demonstração. */
export function describeOrigin(s: WorkspaceSummary): string {
  return `${plural(s.realRecords, 'registro criado pela equipe', 'registros criados pela equipe')} e ${plural(s.demoRecords, 'registro de demonstração', 'registros de demonstração')}`;
}
