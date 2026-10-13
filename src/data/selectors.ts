import type { Attributes } from '@/domain/attributes';
import { calculateOverall, type OverallWeights } from '@/domain/overall';
import { latestEvaluation, type Evaluation, type Player } from '@/domain/player';

/** Atleta + a avaliação vigente + Overall derivado. Sem avaliação, overall e attributes são null. */
export interface PlayerCardData {
  player: Player;
  evaluation: Evaluation | null;
  attributes: Attributes | null;
  overall: number | null;
}

export function buildPlayerCard(
  player: Player,
  evaluations: readonly Evaluation[],
  weights: OverallWeights,
): PlayerCardData {
  const evaluation = latestEvaluation(evaluations, player.id);
  return {
    player,
    evaluation,
    attributes: evaluation?.attributes ?? null,
    overall: evaluation ? calculateOverall(evaluation.attributes, player.primaryPosition, weights) : null,
  };
}

export function buildPlayerCards(
  players: readonly Player[],
  evaluations: readonly Evaluation[],
  weights: OverallWeights,
): PlayerCardData[] {
  return players.map((player) => buildPlayerCard(player, evaluations, weights));
}
