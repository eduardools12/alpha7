import { matchState, outcomeOf, type Match, type MatchOutcome, type MatchSet, type MatchState, type Rally } from '@/domain/match';

/** Estado derivado de uma partida a partir das coleções do workspace. */
export const stateFor = (match: Match, sets: readonly MatchSet[], rallies: readonly Rally[]): MatchState => matchState(match, sets, rallies);

/** "25 x 20" (Alpha7 primeiro). */
export const scoreText = (us: number, them: number): string => `${us} x ${them}`;

/** Lista dos placares dos sets já encerrados e do que está em jogo: "25 x 20 · 22 x 25 · 12 x 9 (em jogo)". */
export function setScoresText(state: MatchState): string {
  return state.sets
    .map((s) => `${scoreText(s.score.us, s.score.them)}${s.closed ? '' : ' (em jogo)'}`)
    .join(' · ');
}

export const OUTCOME_LABEL: Record<Exclude<MatchOutcome, null>, string> = {
  vitoria: 'Vitória',
  derrota: 'Derrota',
  empate: 'Empate',
};

export const outcomeText = (match: Match): string | null => {
  const outcome = outcomeOf(match);
  return outcome ? OUTCOME_LABEL[outcome] : null;
};

/** "Melhor de 5 · 25 pontos (decisivo 15) · diferença de 2". */
export function formatSummary(match: Match): string {
  const f = match.format;
  const sets = f.bestOf === 1 ? 'Set único' : `Melhor de ${f.bestOf}`;
  const deciding = f.bestOf > 1 ? ` (decisivo ${f.decidingSetPoints})` : '';
  return `${sets} · ${f.setPoints} pontos${deciding} · diferença de ${f.minLead}`;
}
